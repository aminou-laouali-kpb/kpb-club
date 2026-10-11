import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONSENT_VERSION, DELETION_CONFIRM_WORD, deletionDueAt, needsConsent } from "./privacy";

async function ownProfile(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, consent_at, consent_version, deletion_requested_at")
    .eq("auth_user_id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export const getPrivacyState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const p = await ownProfile(context.userId);
    return {
      needsConsent: needsConsent(p),
      deletionRequestedAt: p.deletion_requested_at,
      deletionDueAt: p.deletion_requested_at
        ? deletionDueAt(p.deletion_requested_at).toISOString()
        : null,
    };
  });

export const acceptConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        terms: z.literal(true),
        whatsapp: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        consent_at: new Date().toISOString(),
        consent_version: CONSENT_VERSION,
        whatsapp_optin: data.whatsapp,
      })
      .eq("auth_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ confirm: z.literal(DELETION_CONFIRM_WORD) }).parse(input),
  )
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const p = await ownProfile(context.userId);
    const requestedAt = p.deletion_requested_at ?? new Date().toISOString();
    if (!p.deletion_requested_at) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ deletion_requested_at: requestedAt })
        .eq("id", p.id);
      if (error) throw new Error(error.message);

      const due = deletionDueAt(requestedAt);
      const { formatDateFr } = await import("./matching");
      const { queueNotifications } = await import("./notifications.server");
      const appUrl = process.env["APP_URL"] ?? "https://kpb-education.com";
      await queueNotifications([
        {
          profile_id: p.id,
          recipient: p.email,
          kind: "account_deletion",
          subject: "Suppression de votre compte KPB",
          body: `Bonjour ${p.full_name || ""},\n\nVotre compte, vos documents, vos essais et vos échanges avec le coach seront définitivement supprimés le ${formatDateFr(due.toISOString().slice(0, 10))}.\n\nVous avez changé d'avis ? Annulez depuis votre compte avant cette date : ${appUrl}/compte\n\nL'équipe KPB Education`,
          dedupe_key: `deletion:${p.id}:${requestedAt}`,
        },
      ]).catch((e) => console.error("deletion notice", e));
    }
    return { ok: true, deletionDueAt: deletionDueAt(requestedAt).toISOString() };
  });

export const cancelAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ deletion_requested_at: null })
      .eq("auth_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Événements déclenchés côté navigateur (liste fermée). */
export const trackClientEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ name: z.enum(["alert_clicked"]), source: z.string().max(40).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const p = await ownProfile(context.userId);
    const { track } = await import("./analytics.server");
    await track(p.id, data.name, { source: data.source ?? null });
    return { ok: true };
  });
