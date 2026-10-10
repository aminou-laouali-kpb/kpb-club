import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { channelsFor, type Prefs } from "./notification-prefs";

export type QueuedNotification = {
  profile_id: string;
  recipient: string | null;
  kind: string;
  subject: string;
  body: string;
  dedupe_key: string;
  /** Envoi différé (fenêtre 8 h – 20 h locale) ; immédiat par défaut. */
  send_after?: string;
};

const PREF_FIELDS =
  "id, email, phone_e164, phone_verified_at, email_optin, notif_email, whatsapp_optin, notif_whatsapp_alerts, notif_whatsapp_reminders, notif_whatsapp_content";

/** Version courte d'un message pour WhatsApp : sans formule d'appel ni signature. */
export function whatsappSummary(body: string) {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) => l && !/^bonjour\b/i.test(l) && !/^l'équipe kpb/i.test(l) && !/^https?:\/\//.test(l),
    );
  const text = lines.join(" ").replace(/\s+/g, " ");
  return text.length > 600 ? `${text.slice(0, 599)}…` : text;
}

export function firstLink(body: string) {
  return (
    /(https?:\/\/\S+)/.exec(body)?.[1] ?? process.env["APP_URL"] ?? "https://kpb-education.com"
  );
}

/**
 * Met en file les notifications, en ignorant celles déjà créées (dedupe_key).
 * Chaque message part par email et/ou WhatsApp selon les préférences du membre ;
 * un message adressé à un tiers (ex. un professeur) part uniquement par email.
 */
export async function queueNotifications(items: QueuedNotification[]) {
  if (items.length === 0) return 0;
  const ids = [...new Set(items.map((i) => i.profile_id))];
  const { data: profiles } = await supabaseAdmin.from("profiles").select(PREF_FIELDS).in("id", ids);
  const prefsById = new Map((profiles ?? []).map((p) => [p.id, p as Prefs & { id: string }]));

  type Row = QueuedNotification & {
    channel: string;
    template?: string | null;
    template_params?: Json | null;
  };
  const rows: Row[] = [];
  for (const item of items) {
    const prefs = prefsById.get(item.profile_id);
    const toThirdParty = Boolean(item.recipient && prefs && item.recipient !== prefs.email);
    if (!prefs || toThirdParty) {
      if (item.recipient) rows.push({ ...item, channel: "email" });
      continue;
    }
    const channels = channelsFor(item.kind, prefs);
    if (channels.email && item.recipient) rows.push({ ...item, channel: "email" });
    if (channels.whatsapp && prefs.phone_e164) {
      rows.push({
        ...item,
        channel: "whatsapp",
        recipient: prefs.phone_e164,
        dedupe_key: `${item.dedupe_key}:wa`,
        template: "kpb_notification",
        template_params: [item.subject, whatsappSummary(item.body), firstLink(item.body)],
      });
    }
  }
  if (rows.length === 0) return 0;
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

async function markSent(id: string, waMessageId?: string | null) {
  await supabaseAdmin
    .from("notifications")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
      ...(waMessageId ? { wa_message_id: waMessageId } : {}),
    })
    .eq("id", id);
}

async function markFailed(id: string, error: string) {
  await supabaseAdmin.from("notifications").update({ status: "failed", error }).eq("id", id);
}

/** Envoie les notifications dues (email via Resend, WhatsApp via l'API Cloud de Meta). */
export async function dispatchPending(limit = 100) {
  const { data: pending, error } = await supabaseAdmin
    .from("notifications")
    .select("id, channel, recipient, subject, body, template_params")
    .eq("status", "pending")
    .lte("send_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["KPB_EMAIL_FROM"] ?? "KPB Education <onboarding@resend.dev>";
  const wa = await import("./whatsapp/client.server");
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Fenêtre de 24 h de Meta : texte libre possible si le membre nous a écrit récemment
  const waRecipients = (pending ?? [])
    .filter((n) => n.channel === "whatsapp")
    .map((n) => n.recipient!);
  const recentInbound = new Set<string>();
  if (waRecipients.length > 0) {
    const { data: sessions } = await supabaseAdmin
      .from("whatsapp_sessions")
      .select("phone_e164, last_inbound_at")
      .in("phone_e164", waRecipients)
      .gte("last_inbound_at", new Date(Date.now() - 23 * 3_600_000).toISOString());
    for (const s of sessions ?? []) recentInbound.add(s.phone_e164);
  }

  for (const item of pending ?? []) {
    if (!item.recipient) {
      await markFailed(item.id, "Destinataire manquant");
      failed += 1;
      continue;
    }
    try {
      if (item.channel === "whatsapp") {
        if (!wa.whatsappConfigured()) {
          skipped += 1;
          continue;
        }
        const params = (item.template_params ?? []) as [string, string, string];
        const id = recentInbound.has(item.recipient)
          ? await wa.sendText(item.recipient, `*${params[0]}*\n${params[1]}\n${params[2]}`)
          : await wa.sendNotificationTemplate(item.recipient, params);
        await markSent(item.id, id);
      } else {
        if (!apiKey) {
          skipped += 1;
          continue;
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [item.recipient],
            subject: item.subject,
            text: item.body,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await markSent(item.id);
      }
      sent += 1;
    } catch (e) {
      await markFailed(item.id, e instanceof Error ? e.message : "Erreur inconnue");
      failed += 1;
    }
  }

  return { sent, failed, pending: skipped };
}
