import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRICING, type ClubPlan } from "./pricing";
import { matchBourses, type Bourse } from "./matching";

const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(24).optional().nullable(),
  date_of_birth: z.string().trim().max(10).optional().nullable(),
  gender: z.enum(["M", "F", "other"]).optional().nullable(),
  nationality: z.string().trim().max(2).optional().nullable(),
  residence: z.string().trim().max(2).optional().nullable(),
  education: z.enum(["bac", "licence", "master", "doctorat", "autre"]).optional().nullable(),
  field_of_study: z.string().trim().max(120).optional().nullable(),
  english_level: z
    .enum(["none", "basic", "intermediate", "advanced", "native"])
    .optional()
    .nullable(),
  financial_need: z.boolean().optional(),
  whatsapp_optin: z.boolean().optional(),
  email_optin: z.boolean().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export type SubscriptionState = "active" | "grace" | "none";

function computeState(sub: { ends_at: string; grace_ends_at: string | null } | null) {
  if (!sub) return { state: "none" as SubscriptionState, daysLeft: 0 };
  const now = Date.now();
  const ends = new Date(sub.ends_at).getTime();
  const grace = sub.grace_ends_at ? new Date(sub.grace_ends_at).getTime() : ends;
  if (now <= ends) {
    return { state: "active" as SubscriptionState, daysLeft: Math.ceil((ends - now) / 86_400_000) };
  }
  if (now <= grace) {
    return { state: "grace" as SubscriptionState, daysLeft: Math.ceil((grace - now) / 86_400_000) };
  }
  return { state: "none" as SubscriptionState, daysLeft: 0 };
}

export const getMemberOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Profil introuvable");

    const [{ data: subs }, { data: payments }, { data: bourses }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("*")
        .eq("profile_id", profile.id)
        .order("ends_at", { ascending: false })
        .limit(5),
      supabase
        .from("payments")
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("bourses").select("*").eq("window_confirmed", true),
    ]);

    const latest = subs?.[0] ?? null;
    const { state, daysLeft } = computeState(latest);
    const matched = matchBourses(profile, (bourses ?? []) as unknown as Bourse[]);

    return {
      profile,
      subscription: latest,
      subscriptionState: state,
      daysLeft,
      payments: payments ?? [],
      matches: matched,
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload: Record<string, unknown> = {
      date_of_birth: data.date_of_birth ? data.date_of_birth : null,
    };
    for (const [key, value] of Object.entries(data)) {
      if (key === "date_of_birth") continue;
      if (value !== undefined) payload[key] = value;
    }
    const { error } = await supabase
      .from("profiles")
      .update(payload as never)
      .eq("auth_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const orderSchema = z.object({
  plan: z.enum(["monthly", "quarterly"]),
  provider: z.enum(["wave", "orange_money", "mtn_momo", "moov_money"]),
});

/** Enregistre une intention de paiement. L'activation est manuelle en attendant MoneyFusion. */
export const requestSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profil introuvable");

    const plan = data.plan as ClubPlan;
    const { error } = await supabase.from("payments").insert({
      profile_id: profile.id,
      payable_type: "subscription",
      amount: PRICING.club[plan].amount,
      provider: data.provider,
      status: "pending",
      metadata: { plan, source: "web" },
    });
    if (error) throw new Error(error.message);
    return { ok: true, amount: PRICING.club[plan].amount };
  });
