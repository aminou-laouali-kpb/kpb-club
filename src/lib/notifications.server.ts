import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

/** Met en file les notifications, en ignorant celles déjà créées (dedupe_key). */
export async function queueNotifications(items: QueuedNotification[]) {
  if (items.length === 0) return 0;
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .upsert(
      items.map((i) => ({ ...i, channel: "email" })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Envoie les notifications en attente si un fournisseur d'email est configuré. */
export async function dispatchPending(limit = 100) {
  const { data: pending, error } = await supabaseAdmin
    .from("notifications")
    .select("id, recipient, subject, body")
    .eq("status", "pending")
    .lte("send_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { sent: 0, failed: 0, pending: pending?.length ?? 0, provider: "none" };

  const from = process.env["KPB_EMAIL_FROM"] ?? "KPB Education <onboarding@resend.dev>";
  let sent = 0;
  let failed = 0;

  for (const item of pending ?? []) {
    if (!item.recipient) {
      await supabaseAdmin
        .from("notifications")
        .update({ status: "failed", error: "Adresse email manquante" })
        .eq("id", item.id);
      failed += 1;
      continue;
    }
    try {
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
      await supabaseAdmin
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", item.id);
      sent += 1;
    } catch (e) {
      await supabaseAdmin
        .from("notifications")
        .update({ status: "failed", error: e instanceof Error ? e.message : "Erreur inconnue" })
        .eq("id", item.id);
      failed += 1;
    }
  }

  return { sent, failed, pending: (pending?.length ?? 0) - sent - failed, provider: "resend" };
}
