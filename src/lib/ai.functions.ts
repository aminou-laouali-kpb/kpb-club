import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { AiFeature } from "./ai/quotas";

/** Résultat commun : les erreurs du coach sont renvoyées proprement, jamais levées vers l'écran. */
type Failure = { ok: false; error: string; kind: string };

async function guarded<T>(fn: () => Promise<T>): Promise<T | Failure> {
  try {
    return await fn();
  } catch (e) {
    const { AiError, toAiError } = await import("./ai/client.server");
    const err = e instanceof AiError ? e : toAiError(e);
    return { ok: false, error: err.message, kind: err.kind };
  }
}

/** Quotas restants, niveau d'accès et historique des analyses. */
export const getAiOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAiMember, quotaStatus } = await import("./ai/access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const member = await getAiMember(context.userId);
    const features: Exclude<AiFeature, "doc_classify">[] = [
      "essay_review",
      "cv_review",
      "interview_sim",
      "coach_chat",
    ];
    const quotas = Object.fromEntries(
      await Promise.all(features.map(async (f) => [f, await quotaStatus(member, f)] as const)),
    );
    const { data: history } = await supabaseAdmin
      .from("ai_usage")
      .select("id, feature, result, created_at, application_id, item_id")
      .eq("profile_id", member.profileId)
      .in("feature", ["essay_review", "cv_review"])
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: interviews } = await supabaseAdmin
      .from("ai_threads")
      .select("id, title, state, created_at")
      .eq("profile_id", member.profileId)
      .eq("feature", "interview_sim")
      .order("created_at", { ascending: false })
      .limit(10);
    return {
      tier: member.tier,
      quotas,
      history: history ?? [],
      interviews: (interviews ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        createdAt: t.created_at,
        score: ((t.state as { debrief?: { score?: number } } | null)?.debrief?.score ?? null) as
          number | null,
      })),
    };
  });

/** Contexte d'un essai du tracker : sujet, limite, critères de la bourse. */
async function essayContext(userId: string, itemId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: item } = await supabaseAdmin
    .from("application_items")
    .select(
      "id, kind, essay_draft, essay_prompt, essay_max_words, applications!inner ( id, profile_id, profiles!inner ( auth_user_id ), bourses ( id, university_name, english_required, essay_criteria ) )",
    )
    .eq("id", itemId)
    .maybeSingle();
  const app = item?.applications as unknown as {
    id: string;
    profiles: { auth_user_id: string };
    bourses: {
      id: string;
      university_name: string;
      english_required: boolean;
      essay_criteria: Json | null;
    } | null;
  } | null;
  if (!item || !app || app.profiles.auth_user_id !== userId || item.kind !== "essay") return null;
  return { item, applicationId: app.id, bourse: app.bourses };
}

async function bourseContext(bourseId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("bourses")
    .select("id, university_name, english_required, essay_criteria, interview_format, country")
    .eq("id", bourseId)
    .maybeSingle();
  return data;
}

type Criterion = { name: string; description: string; weight?: number };

export const reviewEssay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: z.string().uuid().nullable().optional(),
        text: z.string().max(20_000).nullable().optional(),
        bourseId: z.string().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    guarded(async () => {
      const { getAiMember, assertQuota, recordUsage } = await import("./ai/access.server");
      const { runStructured, MODEL_STRONG, AiError } = await import("./ai/client.server");
      const { EssayReview } = await import("./ai/schemas");
      const { anonymize, countWords, detectWritingRequest, WRITING_REFUSAL } =
        await import("./ai/guard");
      const prompts = await import("./ai/prompts/essay");
      const member = await getAiMember(context.userId);

      let essay = data.text ?? "";
      let prompt: string | null = null;
      let maxWords: number | null = null;
      let applicationId: string | null = null;
      let bourse: {
        university_name: string;
        english_required: boolean;
        essay_criteria: Json | null;
      } | null = null;
      if (data.itemId) {
        const ctx = await essayContext(context.userId, data.itemId);
        if (!ctx) throw new AiError("unavailable", "Essai introuvable.");
        essay = data.text ?? ctx.item.essay_draft ?? "";
        prompt = ctx.item.essay_prompt;
        maxWords = ctx.item.essay_max_words;
        applicationId = ctx.applicationId;
        bourse = ctx.bourse;
      } else if (data.bourseId) {
        bourse = await bourseContext(data.bourseId);
      }

      // Une demande « écris-moi… » est refusée sans appel à l'API ni décompte
      if (countWords(essay) < 80 && detectWritingRequest(essay)) {
        return { ok: true as const, refusal: WRITING_REFUSAL };
      }
      if (countWords(essay) < 80) {
        throw new AiError(
          "too_long",
          "Ton essai est trop court pour être analysé (80 mots minimum).",
        );
      }

      await assertQuota(member, "essay_review");
      const criteria = (
        Array.isArray(bourse?.essay_criteria)
          ? bourse.essay_criteria
          : prompts.DEFAULT_ESSAY_CRITERIA
      ) as Criterion[];
      const result = await runStructured({
        model: MODEL_STRONG(),
        system: prompts.ESSAY_SYSTEM,
        cached: prompts.essayCriteriaBlock(bourse?.university_name ?? null, criteria),
        content: prompts.essayUserMessage({
          prompt,
          maxWords,
          language: bourse?.english_required ? "en" : "fr",
          profileSummary: member.summary,
          essay: anonymize(essay, {
            full_name: member.fullName,
            email: member.email,
            phone: member.phone,
          }),
        }),
        schema: EssayReview,
        effort: "medium",
      });
      if (result.data.refusal) return { ok: true as const, refusal: result.data.refusal };

      const usageId = await recordUsage({
        member,
        feature: "essay_review",
        usage: result.usage,
        result: result.data as unknown as Json,
        applicationId,
        itemId: data.itemId ?? null,
      });
      if (data.itemId && usageId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("application_items")
          .update({ last_ai_review_id: usageId })
          .eq("id", data.itemId);
      }
      const { track } = await import("./analytics.server");
      await track(member.profileId, "essay_reviewed", { score: result.data.overall_score ?? null });
      return { ok: true as const, review: result.data, reviewId: usageId };
    }),
  );

export const reviewCv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid().nullable().optional(),
        text: z.string().max(20_000).nullable().optional(),
        bourseId: z.string().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    guarded(async () => {
      const { getAiMember, assertQuota, recordUsage } = await import("./ai/access.server");
      const { runStructured, MODEL_STRONG, AiError } = await import("./ai/client.server");
      const { CvReview } = await import("./ai/schemas");
      const { CV_SYSTEM } = await import("./ai/prompts/cv");
      const { anonymize, isIdentityDocument } = await import("./ai/guard");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const member = await getAiMember(context.userId);
      await assertQuota(member, "cv_review");

      const bourse = data.bourseId ? await bourseContext(data.bourseId) : null;
      const target = `<target>${bourse ? `Bourse visée : ${bourse.university_name} (${bourse.country})` : "Bourse non précisée"}. Profil : ${member.summary}.</target>`;

      let content: Parameters<typeof runStructured>[0]["content"];
      if (data.documentId) {
        const { data: doc } = await supabaseAdmin
          .from("documents")
          .select("storage_path, type, mime_type")
          .eq("id", data.documentId)
          .eq("profile_id", member.profileId)
          .maybeSingle();
        if (!doc) throw new AiError("unavailable", "Document introuvable.");
        if (isIdentityDocument(doc.type)) {
          throw new AiError("refused", "Les pièces d'identité ne sont jamais analysées par l'IA.");
        }
        if (doc.mime_type !== "application/pdf")
          throw new AiError("unavailable", "Le CV doit être un PDF.");
        const { data: file } = await supabaseAdmin.storage
          .from("documents")
          .download(doc.storage_path);
        if (!file) throw new AiError("unavailable", "Document illisible.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        content = [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: btoa(binary) },
          },
          { type: "text", text: `${target}\nAnalyse ce CV.` },
        ];
      } else if (data.text && data.text.trim().length > 100) {
        content = `${target}\n<cv>\n${anonymize(data.text, { full_name: member.fullName, email: member.email, phone: member.phone })}\n</cv>`;
      } else {
        throw new AiError("too_long", "Choisis un CV de ton coffre-fort ou colle son contenu.");
      }

      const result = await runStructured({
        model: MODEL_STRONG(),
        system: CV_SYSTEM,
        content,
        schema: CvReview,
        effort: "medium",
      });
      if (result.data.refusal) return { ok: true as const, refusal: result.data.refusal };
      const reviewId = await recordUsage({
        member,
        feature: "cv_review",
        usage: result.usage,
        result: result.data as unknown as Json,
      });
      return { ok: true as const, review: result.data, reviewId };
    }),
  );

/** Démarre un entretien simulé : questions générées pour la bourse et le profil. */
export const startInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        bourseId: z.string().max(120).nullable().optional(),
        applicationId: z.string().uuid().nullable().optional(),
        language: z.enum(["fr", "en"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    guarded(async () => {
      const { getAiMember, assertQuota, recordUsage } = await import("./ai/access.server");
      const { runStructured, MODEL_STRONG } = await import("./ai/client.server");
      const { InterviewPlan } = await import("./ai/schemas");
      const { INTERVIEW_PLAN_SYSTEM } = await import("./ai/prompts/interview");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const member = await getAiMember(context.userId);
      await assertQuota(member, "interview_sim");

      const bourse = data.bourseId ? await bourseContext(data.bourseId) : null;
      const formats: Record<string, string> = {
        video: "entretien vidéo individuel",
        panel: "entretien devant un jury de plusieurs personnes",
        written: "questions écrites",
        none: "entretien de motivation",
      };
      const result = await runStructured({
        model: MODEL_STRONG(),
        system: INTERVIEW_PLAN_SYSTEM,
        content: `<bourse>${bourse ? `${bourse.university_name} (${bourse.country})` : "bourse d'études internationale"}</bourse>
<format>${formats[bourse?.interview_format ?? "panel"] ?? formats["panel"]}</format>
<langue>${data.language === "en" ? "anglais" : "français"}</langue>
<profil>${member.summary}</profil>`,
        schema: InterviewPlan,
        effort: "medium",
      });

      const { data: thread, error } = await supabaseAdmin
        .from("ai_threads")
        .insert({
          profile_id: member.profileId,
          feature: "interview_sim",
          application_id: data.applicationId ?? null,
          title: `Entretien — ${bourse?.university_name ?? "simulation libre"}`,
          state: {
            questions: result.data.questions,
            index: 0,
            language: data.language,
            bourse: bourse?.university_name ?? null,
          } as unknown as Json,
        })
        .select("id")
        .single();
      if (error) throw error;
      await recordUsage({
        member,
        feature: "interview_sim",
        usage: result.usage,
        threadId: thread.id,
      });
      return {
        ok: true as const,
        threadId: thread.id,
        total: result.data.questions.length,
        question: result.data.questions[0]!.question,
      };
    }),
  );

/** Bilan final de l'entretien. */
export const finishInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    guarded(async () => {
      const { getAiMember, recordUsage } = await import("./ai/access.server");
      const { runStructured, MODEL_STRONG, AiError } = await import("./ai/client.server");
      const { InterviewDebrief } = await import("./ai/schemas");
      const { INTERVIEW_DEBRIEF_SYSTEM } = await import("./ai/prompts/interview");
      const { anonymize } = await import("./ai/guard");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const member = await getAiMember(context.userId);
      const { data: thread } = await supabaseAdmin
        .from("ai_threads")
        .select("id, state")
        .eq("id", data.threadId)
        .eq("profile_id", member.profileId)
        .maybeSingle();
      if (!thread) throw new AiError("unavailable", "Entretien introuvable.");
      const state = thread.state as { debrief?: unknown; bourse?: string | null };
      if (state.debrief) return { ok: true as const, debrief: state.debrief as never };

      const { data: messages } = await supabaseAdmin
        .from("ai_messages")
        .select("role, content")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });
      if (!messages || messages.length < 2) {
        throw new AiError(
          "too_long",
          "Réponds à au moins une question avant de demander le bilan.",
        );
      }
      const transcript = messages
        .map(
          (m) =>
            `${m.role === "user" ? "Candidat" : "Coach"} : ${anonymize(m.content, { full_name: member.fullName })}`,
        )
        .join("\n\n");
      const result = await runStructured({
        model: MODEL_STRONG(),
        system: INTERVIEW_DEBRIEF_SYSTEM,
        content: `<bourse>${state.bourse ?? "bourse d'études"}</bourse>\n<transcription>\n${transcript}\n</transcription>`,
        schema: InterviewDebrief,
        effort: "medium",
      });
      await supabaseAdmin
        .from("ai_threads")
        .update({ state: { ...state, debrief: result.data } as unknown as Json })
        .eq("id", thread.id);
      await recordUsage({
        member,
        feature: "interview_sim",
        usage: result.usage,
        threadId: thread.id,
      });
      return { ok: true as const, debrief: result.data };
    }),
  );

/** Suggestion du type d'un document (jamais pour une pièce d'identité). */
export const suggestDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fileName: z.string().max(200),
        imageBase64: z.string().max(700_000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    guarded(async () => {
      const { getAiMember, assertQuota, recordUsage } = await import("./ai/access.server");
      const { runStructured, MODEL_FAST } = await import("./ai/client.server");
      const { DocTypeGuess } = await import("./ai/schemas");
      const { CLASSIFY_SYSTEM } = await import("./ai/prompts/classify");
      const member = await getAiMember(context.userId);
      await assertQuota(member, "doc_classify");
      const content: Parameters<typeof runStructured>[0]["content"] = [
        ...(data.imageBase64
          ? [
              {
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: "image/jpeg" as const,
                  data: data.imageBase64,
                },
              },
            ]
          : []),
        { type: "text" as const, text: `Nom du fichier : ${data.fileName}` },
      ];
      const result = await runStructured({
        model: MODEL_FAST(),
        system: CLASSIFY_SYSTEM,
        content,
        schema: DocTypeGuess,
        effort: "low",
        maxTokens: 2_000,
      });
      await recordUsage({ member, feature: "doc_classify", usage: result.usage });
      return { ok: true as const, guess: result.data };
    }),
  );

/** Ce que l'étudiant peut soumettre au coach : essais du tracker, CV du coffre-fort, candidatures. */
export const listCoachInputs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Profil introuvable");
    const [{ data: apps }, { data: docs }] = await Promise.all([
      context.supabase
        .from("applications")
        .select(
          "id, bourse_id, status, bourses ( university_name ), application_items ( id, kind, label, essay_draft, last_ai_review_id )",
        )
        .eq("profile_id", profile.id)
        .not("status", "in", "(rejected,abandoned)"),
      context.supabase
        .from("documents")
        .select("id, label, created_at")
        .eq("profile_id", profile.id)
        .eq("type", "cv")
        .eq("mime_type", "application/pdf")
        .order("created_at", { ascending: false }),
    ]);
    const applications = (apps ?? []).map((a) => ({
      id: a.id,
      bourseId: a.bourse_id,
      bourseName: (a.bourses as { university_name: string } | null)?.university_name ?? "Bourse",
    }));
    const essays = (apps ?? []).flatMap((a) =>
      (a.application_items ?? [])
        .filter((i) => i.kind === "essay" && (i.essay_draft ?? "").trim().length > 0)
        .map((i) => ({
          itemId: i.id,
          label: i.label,
          bourseId: a.bourse_id,
          bourseName: (a.bourses as { university_name: string } | null)?.university_name ?? "",
          words: (i.essay_draft ?? "").trim().split(/\s+/).length,
          reviewed: Boolean(i.last_ai_review_id),
        })),
    );
    return { applications, essays, cvs: docs ?? [] };
  });
