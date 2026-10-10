import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Parcours anglais : niveau déclaré, exigences de chaque candidature, sessions de test utiles. */
export const getEnglishOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select(
        "id, english_level, english_test, english_test_score, english_test_date, english_self_level, residence",
      )
      .eq("auth_user_id", context.userId)
      .single();
    const [{ data: apps }, { data: sessions }] = await Promise.all([
      context.supabase
        .from("applications")
        .select(
          "id, deadline, status, bourses ( university_name, english_required, english_tests )",
        )
        .eq("profile_id", profile!.id)
        .not("status", "in", "(accepted,rejected,abandoned)"),
      context.supabase
        .from("english_test_sessions")
        .select(
          "id, test, city, country, session_date, register_by, cost_indicative, results_days, notes",
        )
        .gte("session_date", new Date().toISOString().slice(0, 10))
        .order("session_date", { ascending: true })
        .limit(50),
    ]);
    return {
      profile: profile!,
      applications: (apps ?? []).map((a) => {
        const b = a.bourses as {
          university_name: string;
          english_required: boolean;
          english_tests: { test: "ielts" | "toefl" | "duolingo"; min_score: number }[] | null;
        } | null;
        return {
          id: a.id,
          deadline: a.deadline,
          bourse: b?.university_name ?? "Bourse",
          englishRequired: b?.english_required ?? false,
          tests: b?.english_tests ?? [],
        };
      }),
      sessions: sessions ?? [],
    };
  });
