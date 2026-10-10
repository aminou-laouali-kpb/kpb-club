import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REFERRAL_ATTACH_MAX_AGE_DAYS,
  REWARD_DAYS,
  normalizeReferralCode,
  progressToNextReward,
} from "./referrals";

/** Rattache le compte au parrain dont le code a été capturé (lien ?ref=). */
export const attachReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const code = normalizeReferralCode(data.code);
    if (!code) return { ok: false as const, reason: "invalid" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, referred_by, referral_code, created_at")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!me) return { ok: false as const, reason: "profile" };
    if (me.referred_by) return { ok: true as const, already: true };
    if (me.referral_code === code) return { ok: false as const, reason: "self" };
    const ageDays = (Date.now() - Date.parse(me.created_at)) / 86_400_000;
    if (ageDays > REFERRAL_ATTACH_MAX_AGE_DAYS) return { ok: false as const, reason: "too_old" };

    const { data: referrer } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();
    if (!referrer || referrer.id === me.id) return { ok: false as const, reason: "unknown" };

    // Un compte qui a déjà payé n'est pas un nouveau filleul
    const { count } = await supabaseAdmin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", me.id)
      .eq("status", "success");
    if ((count ?? 0) > 0) return { ok: false as const, reason: "already_paid" };

    const { error } = await supabaseAdmin
      .from("referrals")
      .insert({ referrer_id: referrer.id, referred_id: me.id });
    if (error && error.code !== "23505") throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ referred_by: referrer.id })
      .eq("id", me.id)
      .is("referred_by", null);
    return { ok: true as const, already: false };
  });

export const getReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("id, referral_code, is_ambassador")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!me) throw new Error("Profil introuvable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("referrals")
      .select(
        "id, status, created_at, paid_at, rewarded_at, profiles!referrals_referred_id_fkey ( full_name )",
      )
      .eq("referrer_id", me.id)
      .order("created_at", { ascending: false });

    const list = (rows ?? []).map((r) => {
      const name = (
        (r.profiles as unknown as { full_name: string } | null)?.full_name ?? ""
      ).trim();
      // Seul le prénom est montré au parrain
      return {
        id: r.id,
        firstName: name.split(/\s+/)[0] || "Invité",
        status: r.status,
        createdAt: r.created_at,
        paidAt: r.paid_at,
      };
    });
    const paid = list.filter((r) => r.status === "paid").length;
    const rewarded = list.filter((r) => r.status === "rewarded").length;
    return {
      code: me.referral_code,
      isAmbassador: me.is_ambassador,
      referrals: list,
      counts: { signedUp: list.length, paid: paid + rewarded },
      daysEarned: (rewarded / 2) * REWARD_DAYS,
      progress: progressToNextReward(paid, 0),
    };
  });
