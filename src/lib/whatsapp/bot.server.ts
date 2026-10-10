/**
 * Bot WhatsApp : commandes (statut, échéances, bourses, action, aide, agent),
 * documents envoyés en photo ou PDF, et questions libres au coach.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MENU_ROWS,
  clip,
  formatActions,
  formatBourses,
  formatDeadlines,
  formatMenu,
  formatStatus,
  parseCommand,
} from "./commands";
import { sendList, sendText, downloadMedia } from "./client.server";
import { DOCUMENT_TYPES, checkQuota, documentTypeLabel } from "../documents";

export type Inbound = {
  id: string;
  from: string; // E.164 sans « + »
  type: string;
  text?: { body: string };
  interactive?: {
    list_reply?: { id: string; title: string };
    button_reply?: { id: string; title: string };
  };
  button?: { payload?: string; text?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
};

type Member = {
  id: string;
  auth_user_id: string;
  full_name: string;
};

const appUrl = (path = "") =>
  `${(process.env["APP_URL"] ?? "https://kpb-education.com").replace(/\/$/, "")}${path}`;

/** Types proposés après l'envoi d'un document (10 lignes au plus dans une liste WhatsApp). */
const DOC_CHOICES = [
  "transcript",
  "diploma_bac",
  "diploma_licence",
  "diploma_master",
  "cv",
  "motivation_letter",
  "recommendation_letter",
  "passport",
  "english_test",
  "other",
] as const;

export async function handleInbound(message: Inbound) {
  const phone = `+${message.from.replace(/\D/g, "")}`;

  // Idempotence : Meta peut renvoyer le même message
  const { error: dup } = await supabaseAdmin.from("whatsapp_inbound").insert({
    wa_message_id: message.id,
    phone_e164: phone,
    kind: message.type,
    body: message.text?.body?.slice(0, 2000) ?? null,
  });
  if (dup) return;

  const { data: member } = await supabaseAdmin
    .from("profiles")
    .select("id, auth_user_id, full_name")
    .eq("phone_e164", phone)
    .not("phone_verified_at", "is", null)
    .maybeSingle();

  const { data: session } = await supabaseAdmin
    .from("whatsapp_sessions")
    .upsert(
      {
        phone_e164: phone,
        profile_id: member?.id ?? null,
        last_inbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone_e164" },
    )
    .select("pending")
    .single();

  if (!member) {
    await sendText(
      phone,
      `Bonjour ! Ce numéro n'est pas encore relié à un compte KPB Education.\nCrée ton compte gratuit en 1 minute (connexion par code WhatsApp) : ${appUrl("/auth")}\nSi tu as déjà un compte, relie ce numéro dans « Mon compte ».`,
    );
    return;
  }

  // Réponse à une liste interactive (menu ou type de document)
  const choice =
    message.interactive?.list_reply?.id ??
    message.interactive?.button_reply?.id ??
    message.button?.payload;
  if (choice?.startsWith("doctype:")) {
    await setDocumentType(phone, member, choice.slice(8), session?.pending);
    return;
  }

  if (message.type === "image" || message.type === "document") {
    await receiveDocument(phone, member, message);
    return;
  }

  const text = choice ?? message.text?.body ?? message.button?.text ?? "";
  if (!text.trim()) {
    await sendMenu(phone);
    return;
  }

  switch (parseCommand(text)) {
    case "help":
      return sendMenu(phone);
    case "status":
      return sendText(phone, await statusText(member));
    case "deadlines":
      return sendText(phone, await deadlinesText(member));
    case "actions":
      return sendText(phone, await actionsText(member));
    case "bourses":
      return sendText(phone, await boursesText(member));
    case "agent":
      return contactTeam(phone, member, text);
    default:
      return answerQuestion(phone, member, text);
  }
}

async function sendMenu(phone: string) {
  await sendList(phone, {
    body: formatMenu(),
    button: "Voir le menu",
    rows: MENU_ROWS,
  });
}

async function statusText(member: Member) {
  const { subscriptionStateFor } = await import("../member.functions");
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("ends_at, grace_ends_at")
    .eq("profile_id", member.id)
    .neq("status", "cancelled")
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { state, daysLeft } = subscriptionStateFor(sub ?? null);
  return formatStatus({
    name: member.full_name.split(" ")[0] ?? "",
    state,
    daysLeft,
    endsAt: sub?.ends_at ?? null,
    link: appUrl("/offre"),
  });
}

async function deadlinesText(member: Member) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("application_items")
    .select(
      "label, due_date, applications!inner ( profile_id, status, bourses ( university_name ) )",
    )
    .eq("applications.profile_id", member.id)
    .in("status", ["todo", "in_progress"])
    .gte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(5);
  return formatDeadlines(
    (data ?? []).map((i) => ({
      label: i.label,
      dueDate: i.due_date,
      bourse:
        (i.applications as unknown as { bourses: { university_name: string } | null }).bourses
          ?.university_name ?? "",
    })),
    appUrl("/candidatures"),
  );
}

async function actionsText(member: Member) {
  const { data } = await supabaseAdmin
    .from("applications")
    .select("next_action, readiness, bourses ( university_name )")
    .eq("profile_id", member.id)
    .not("status", "in", "(submitted,interview,accepted,rejected,abandoned)")
    .order("deadline", { ascending: true, nullsFirst: false });
  return formatActions(
    (data ?? []).map((a) => ({
      bourse: (a.bourses as { university_name: string } | null)?.university_name ?? "Bourse",
      action: a.next_action,
      readiness: a.readiness,
    })),
    appUrl("/candidatures"),
  );
}

async function boursesText(member: Member) {
  const { matchBourses } = await import("../matching");
  const [{ data: profile }, { data: bourses }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", member.id).single(),
    supabaseAdmin.from("bourses").select("*").eq("window_confirmed", true),
  ]);
  const matches = profile ? matchBourses(profile, (bourses ?? []) as never) : [];
  return formatBourses(
    matches.map((b) => ({ name: b.university_name, closes: b.window_closes ?? null })),
    appUrl("/candidatures"),
  );
}

async function contactTeam(phone: string, member: Member, text: string) {
  const support = process.env["KPB_SUPPORT_EMAIL"];
  if (support) {
    const { queueNotifications, dispatchPending } = await import("../notifications.server");
    await queueNotifications([
      {
        profile_id: member.id,
        recipient: support,
        kind: "support_request",
        subject: `Demande WhatsApp de ${member.full_name || phone}`,
        body: `${member.full_name || "Un membre"} (${phone}) demande à parler à l'équipe KPB.\nMessage : ${text}\nRépondre sur WhatsApp : https://wa.me/${phone.replace(/\D/g, "")}`,
        dedupe_key: `support:${member.id}:${new Date().toISOString().slice(0, 13)}`,
      },
    ]);
    await dispatchPending(5).catch(() => undefined);
  }
  await sendText(
    phone,
    "C'est noté : un conseiller KPB te répond ici dès que possible (du lundi au samedi, 8 h – 20 h).",
  );
}

async function answerQuestion(phone: string, member: Member, question: string) {
  const { getAiMember, assertQuota, recordUsage } = await import("../ai/access.server");
  const { streamText, MODEL_FAST, AiError } = await import("../ai/client.server");
  const { CHAT_SYSTEM, chatContext } = await import("../ai/prompts/chat");
  const { anonymize, detectWritingRequest, WRITING_REFUSAL } = await import("../ai/guard");
  const { searchKnowledge } = await import("../ai/rag.server");
  if (detectWritingRequest(question)) {
    await sendText(phone, WRITING_REFUSAL);
    return;
  }
  try {
    const ai = await getAiMember(member.auth_user_id);
    await assertQuota(ai, "coach_chat");
    const sources = await searchKnowledge(question, 5);
    const result = await streamText({
      model: MODEL_FAST(),
      system: CHAT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${chatContext({ profileSummary: ai.summary, applications: "", sources })}\n\n<canal>WhatsApp : réponds en texte simple, sans Markdown, 5 phrases au plus.</canal>\n\n<question>${anonymize(question, { full_name: ai.fullName, email: ai.email, phone: ai.phone })}</question>`,
        },
      ],
      effort: "low",
      maxTokens: 1_500,
      onText: () => undefined,
    });
    await recordUsage({ member: ai, feature: "coach_chat", usage: result.usage });
    await sendText(
      phone,
      clip(
        result.refused
          ? "Je ne peux pas répondre à cette question. Écris « agent » pour parler à l'équipe KPB."
          : `${result.text}\n\n(Menu : écris « aide »)`,
        1500,
      ),
    );
  } catch (e) {
    const message = e instanceof AiError ? e.message : "Le coach est momentanément indisponible.";
    await sendText(
      phone,
      clip(`${message}\n\nÉcris « aide » pour voir le menu, ou « agent » pour parler à l'équipe.`),
    );
  }
}

async function receiveDocument(phone: string, member: Member, message: Inbound) {
  const media = message.image ?? message.document;
  if (!media) return;
  const { getAiMember } = await import("../ai/access.server");
  const ai = await getAiMember(member.auth_user_id);

  let file: { bytes: Uint8Array; mimeType: string };
  try {
    file = await downloadMedia(media.id);
  } catch (e) {
    console.error("WhatsApp media", e);
    await sendText(
      phone,
      "Je n'ai pas pu récupérer ce fichier. Réessaie ou ajoute-le depuis l'application.",
    );
    return;
  }

  // Une photo JPEG devient un PDF A4, comme dans l'application
  let bytes = file.bytes;
  let mimeType = file.mimeType.split(";")[0]!.trim();
  if (mimeType === "image/jpeg") {
    const { buildPdfFromJpegs, readJpegInfo } = await import("../pdf-writer");
    try {
      bytes = buildPdfFromJpegs([{ jpeg: bytes, ...readJpegInfo(bytes) }]);
      mimeType = "application/pdf";
    } catch {
      // JPEG illisible : conservé tel quel
    }
  }
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    await sendText(phone, "Format non pris en charge. Envoie une photo ou un PDF.");
    return;
  }

  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("size_bytes")
    .eq("profile_id", member.id);
  const quota = checkQuota({
    hasAccess: ai.tier !== "free",
    documentCount: docs?.length ?? 0,
    usedBytes: (docs ?? []).reduce((n, d) => n + (d.size_bytes ?? 0), 0),
    newBytes: bytes.length,
  });
  if (!quota.ok) {
    await sendText(phone, clip(`${quota.reason}\n${appUrl("/offre")}`));
    return;
  }

  const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1];
  const path = `${member.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("documents")
    .upload(path, bytes, { contentType: mimeType });
  if (uploadError) {
    console.error("WhatsApp upload", uploadError);
    await sendText(phone, "Enregistrement impossible pour le moment. Réessaie plus tard.");
    return;
  }
  const label = (message.document?.filename ?? media.caption ?? "Document WhatsApp").slice(0, 120);
  const { data: doc, error } = await supabaseAdmin
    .from("documents")
    .insert({
      profile_id: member.id,
      type: "other",
      label,
      storage_path: path,
      mime_type: mimeType,
      size_bytes: bytes.length,
      pages: mimeType === "application/pdf" && message.type === "image" ? 1 : null,
      source: "whatsapp",
      processed: message.type === "image",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Pas d'analyse automatique : la pièce peut être une pièce d'identité (spec §12.6)
  await supabaseAdmin
    .from("whatsapp_sessions")
    .update({ pending: { kind: "doc_type", documentId: doc.id } })
    .eq("phone_e164", phone);
  await sendList(phone, {
    body: "Reçu ✅ C'est quel document ? Je le range et je coche ta checklist.",
    button: "Choisir le type",
    rows: DOC_CHOICES.map((t) => ({
      id: `doctype:${t}`,
      title: documentTypeLabel(t).slice(0, 24),
    })),
  });
}

async function setDocumentType(phone: string, member: Member, type: string, pending: unknown) {
  const documentId = (pending as { kind?: string; documentId?: string } | null)?.documentId;
  if (!documentId || !DOCUMENT_TYPES.some((t) => t.value === type)) {
    await sendText(phone, "Je ne retrouve pas le document. Renvoie-le, puis choisis son type.");
    return;
  }
  await supabaseAdmin
    .from("documents")
    .update({ type: type as never, label: documentTypeLabel(type) })
    .eq("id", documentId)
    .eq("profile_id", member.id);
  await supabaseAdmin.from("whatsapp_sessions").update({ pending: null }).eq("phone_e164", phone);
  const { linkDocumentToItems } = await import("../documents.server");
  const linked = await linkDocumentToItems(member.id, documentId, type);
  await sendText(
    phone,
    linked > 0
      ? `Rangé : ${documentTypeLabel(type)}. Coché dans ${linked} élément${linked > 1 ? "s" : ""} de tes candidatures 👍`
      : `Rangé dans ton coffre-fort : ${documentTypeLabel(type)}.\n${appUrl("/documents")}`,
  );
}

/** Statuts de livraison : codes de connexion (repli SMS) et notifications. */
export async function handleStatus(status: { id: string; status: string }) {
  await supabaseAdmin
    .from("otp_codes")
    .update({ delivery_status: status.status })
    .eq("wa_message_id", status.id);
  if (status.status === "failed") {
    await supabaseAdmin
      .from("notifications")
      .update({ status: "failed", error: "Non livré par WhatsApp" })
      .eq("wa_message_id", status.id);
  }
}
