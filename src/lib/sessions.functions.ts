import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MAX_SESSIONS = 2;
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

const schema = z.object({
  token: z.string().trim().min(8).max(64),
  userAgent: z.string().trim().max(200).optional().nullable(),
});

/** Enregistre/rafraîchit la session courante et applique le plafond de 2 appareils. */
export const touchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) return { allowed: true, active: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    await supabaseAdmin.from("member_sessions").upsert(
      {
        profile_id: profile.id,
        session_token: data.token,
        user_agent: data.userAgent ?? null,
        revoked: false,
        last_seen_at: nowIso,
      },
      { onConflict: "profile_id,session_token" },
    );

    const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
    const { data: sessions } = await supabaseAdmin
      .from("member_sessions")
      .select("id, session_token, created_at")
      .eq("profile_id", profile.id)
      .eq("revoked", false)
      .gte("last_seen_at", since)
      .order("created_at", { ascending: false });

    const keep = (sessions ?? []).slice(0, MAX_SESSIONS);
    const revoke = (sessions ?? []).slice(MAX_SESSIONS);
    if (revoke.length > 0) {
      await supabaseAdmin
        .from("member_sessions")
        .update({ revoked: true })
        .in(
          "id",
          revoke.map((s) => s.id),
        );
    }

    return {
      allowed: keep.some((s) => s.session_token === data.token),
      active: keep.length,
    };
  });

export const endSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("member_sessions")
      .update({ revoked: true })
      .eq("profile_id", profile.id)
      .eq("session_token", data.token);
    return { ok: true };
  });
