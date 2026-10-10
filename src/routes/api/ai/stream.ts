import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

/**
 * Réponses du coach en flux (Server-Sent Events) : questions-réponses et retours d'entretien.
 * Authentification : jeton Supabase du membre dans l'en-tête Authorization.
 */
const Body = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("chat"),
    threadId: z.string().uuid().nullable().optional(),
    message: z.string().trim().min(1).max(2_000),
  }),
  z.object({
    mode: z.literal("interview_answer"),
    threadId: z.string().uuid(),
    answer: z.string().trim().min(1).max(6_000),
  }),
]);

type Send = (event: Record<string, unknown>) => void;

export const Route = createFileRoute("/api/ai/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth } = await supabaseAdmin.auth.getUser(token);
        if (!auth.user) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const encoder = new TextEncoder();
        const userId = auth.user.id;
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send: Send = (event) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            try {
              if (body.mode === "chat") await handleChat(userId, body, send, request.signal);
              else await handleInterviewAnswer(userId, body, send, request.signal);
            } catch (e) {
              const { AiError, toAiError } = await import("@/lib/ai/client.server");
              const err = e instanceof AiError ? e : toAiError(e);
              send({ type: "error", message: err.message, kind: err.kind });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});

async function handleChat(
  userId: string,
  body: { threadId?: string | null | undefined; message: string },
  send: Send,
  signal: AbortSignal,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getAiMember, assertQuota, recordUsage } = await import("@/lib/ai/access.server");
  const { streamText, MODEL_FAST } = await import("@/lib/ai/client.server");
  const { CHAT_SYSTEM, chatContext } = await import("@/lib/ai/prompts/chat");
  const { anonymize, detectWritingRequest, WRITING_REFUSAL } = await import("@/lib/ai/guard");
  const { searchKnowledge } = await import("@/lib/ai/rag.server");
  const member = await getAiMember(userId);

  // Conversation existante ou nouvelle
  let threadId = body.threadId ?? null;
  if (threadId) {
    const { data } = await supabaseAdmin
      .from("ai_threads")
      .select("id")
      .eq("id", threadId)
      .eq("profile_id", member.profileId)
      .eq("feature", "coach_chat")
      .maybeSingle();
    threadId = data?.id ?? null;
  }
  if (!threadId) {
    const { data, error } = await supabaseAdmin
      .from("ai_threads")
      .insert({
        profile_id: member.profileId,
        feature: "coach_chat",
        title: body.message.slice(0, 80),
      })
      .select("id")
      .single();
    if (error) throw error;
    threadId = data.id;
  }
  send({ type: "thread", threadId });

  // Demande de rédaction : refus immédiat, sans appel ni décompte
  if (detectWritingRequest(body.message)) {
    await supabaseAdmin.from("ai_messages").insert([
      { thread_id: threadId, role: "user", content: body.message },
      { thread_id: threadId, role: "assistant", content: WRITING_REFUSAL },
    ]);
    send({ type: "text", text: WRITING_REFUSAL });
    send({ type: "done" });
    return;
  }

  await assertQuota(member, "coach_chat");

  const [{ data: history }, { data: apps }, sources] = await Promise.all([
    supabaseAdmin
      .from("ai_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("applications")
      .select("status, deadline, next_action, readiness, bourses ( university_name )")
      .eq("profile_id", member.profileId)
      .not("status", "in", "(accepted,rejected,abandoned)")
      .limit(5),
    searchKnowledge(body.message, 5),
  ]);
  const applications = (apps ?? [])
    .map((a) => {
      const name = (a.bourses as { university_name: string } | null)?.university_name ?? "bourse";
      return `${name} : prête à ${a.readiness} %, date limite ${a.deadline ?? "inconnue"}, prochaine étape « ${a.next_action ?? "—"} »`;
    })
    .join(" ; ");

  const question = anonymize(body.message, {
    full_name: member.fullName,
    email: member.email,
    phone: member.phone,
  });
  const messages = [
    ...(history ?? []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user" as const,
      content: `${chatContext({ profileSummary: member.summary, applications, sources })}\n\n<question>${question}</question>`,
    },
  ];

  const result = await streamText({
    model: MODEL_FAST(),
    system: CHAT_SYSTEM,
    messages,
    effort: "low",
    maxTokens: 2_000,
    onText: (text) => send({ type: "text", text }),
    signal,
  });
  const answer = result.refused
    ? "Je ne peux pas répondre à cette question. Pour une aide personnalisée, contacte l'équipe KPB."
    : result.text;
  if (result.refused) send({ type: "text", text: answer });

  await supabaseAdmin.from("ai_messages").insert([
    { thread_id: threadId, role: "user", content: body.message },
    { thread_id: threadId, role: "assistant", content: answer },
  ]);
  await recordUsage({ member, feature: "coach_chat", usage: result.usage, threadId });
  send({ type: "done", sources: sources.map((s) => s.title) });
}

async function handleInterviewAnswer(
  userId: string,
  body: { threadId: string; answer: string },
  send: Send,
  signal: AbortSignal,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getAiMember, recordUsage } = await import("@/lib/ai/access.server");
  const { streamText, MODEL_FAST, AiError } = await import("@/lib/ai/client.server");
  const { INTERVIEW_FEEDBACK_SYSTEM } = await import("@/lib/ai/prompts/interview");
  const { anonymize } = await import("@/lib/ai/guard");
  const member = await getAiMember(userId);

  const { data: thread } = await supabaseAdmin
    .from("ai_threads")
    .select("id, state")
    .eq("id", body.threadId)
    .eq("profile_id", member.profileId)
    .eq("feature", "interview_sim")
    .maybeSingle();
  if (!thread) throw new AiError("unavailable", "Entretien introuvable.");
  const state = thread.state as {
    questions: { question: string; intent: string }[];
    index: number;
    debrief?: unknown;
  };
  const current = state.questions[state.index];
  if (!current || state.debrief) throw new AiError("unavailable", "Cet entretien est terminé.");

  const result = await streamText({
    model: MODEL_FAST(),
    system: INTERVIEW_FEEDBACK_SYSTEM,
    messages: [
      {
        role: "user",
        content: `<question>${current.question}</question>
<ce_que_cherche_le_jury>${current.intent}</ce_que_cherche_le_jury>
<reponse>${anonymize(body.answer, { full_name: member.fullName, email: member.email, phone: member.phone })}</reponse>`,
      },
    ],
    effort: "low",
    maxTokens: 1_500,
    onText: (text) => send({ type: "text", text }),
    signal,
  });

  const nextIndex = state.index + 1;
  await supabaseAdmin.from("ai_messages").insert([
    { thread_id: thread.id, role: "assistant", content: current.question },
    { thread_id: thread.id, role: "user", content: body.answer },
    { thread_id: thread.id, role: "assistant", content: result.text },
  ]);
  await supabaseAdmin
    .from("ai_threads")
    .update({ state: { ...state, index: nextIndex } as unknown as Json })
    .eq("id", thread.id);
  await recordUsage({ member, feature: "interview_sim", usage: result.usage, threadId: thread.id });
  send({
    type: "done",
    nextQuestion: state.questions[nextIndex]?.question ?? null,
    position: nextIndex + 1,
    total: state.questions.length,
  });
}
