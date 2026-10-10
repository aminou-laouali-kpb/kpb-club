import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchBourses, type Bourse } from "./matching";

const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
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
  timezone: z.string().trim().max(64).optional().nullable(),
  notif_email: z.boolean().optional(),
  notif_whatsapp_alerts: z.boolean().optional(),
  notif_whatsapp_reminders: z.boolean().optional(),
  notif_whatsapp_content: z.boolean().optional(),
  english_test: z.enum(["ielts", "toefl", "duolingo", "none"]).optional().nullable(),
  english_test_score: z.string().trim().max(10).optional().nullable(),
  english_test_date: z.string().date().optional().nullable(),
  english_self_level: z.enum(["A2", "B1", "B2", "C1"]).optional().nullable(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export type SubscriptionState = "active" | "grace" | "none";

/** État d'accès Club d'après l'abonnement le plus lointain. */
export function subscriptionStateFor(
  sub: { ends_at: string; grace_ends_at: string | null } | null,
) {
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

    const [{ data: subs }, { data: payments }, { data: bourses }, { data: applications }] =
      await Promise.all([
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
        supabase
          .from("applications")
          .select(
            "id, bourse_id, status, deadline, readiness, next_action, next_item_id, bourses ( university_name, country )",
          )
          .eq("profile_id", profile.id)
          .order("deadline", { ascending: true, nullsFirst: false }),
      ]);

    const latest = subs?.[0] ?? null;
    const { state, daysLeft } = subscriptionStateFor(latest);
    const matched = matchBourses(profile, (bourses ?? []) as unknown as Bourse[]);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    return {
      isAdmin: Boolean(isAdmin),
      profile,
      subscription: latest,
      subscriptionState: state,
      daysLeft,
      payments: payments ?? [],
      matches: matched,
      applications: applications ?? [],
      onboardingCompleted: Boolean(profile.onboarding_completed),
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Mise à jour partielle : seuls les champs envoyés sont modifiés
    const payload: Record<string, unknown> = {};
    if (data.date_of_birth !== undefined) payload["date_of_birth"] = data.date_of_birth || null;
    for (const [key, value] of Object.entries(data)) {
      if (key === "date_of_birth" || key === "timezone") continue;
      if (value !== undefined) payload[key] = value;
    }
    // Fuseau : choisi par le membre, sinon déduit du pays de résidence
    const { isValidTimezone, timezoneForCountry } = await import("./relance/window");
    if (data.timezone && isValidTimezone(data.timezone)) payload["timezone"] = data.timezone;
    else if (data.residence) payload["timezone"] = timezoneForCountry(data.residence);
    const { error } = await supabase
      .from("profiles")
      .update(payload as never)
      .eq("auth_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
