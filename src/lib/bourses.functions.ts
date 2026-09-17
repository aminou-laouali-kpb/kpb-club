import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Bourse } from "./matching";

export const listBourses = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  const supabasePublic = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data, error } = await supabasePublic
    .from("bourses")
    .select(
      "id, university_name, country, program_url, eligible_nationalities, gender_restriction, min_education, max_age, english_required, financial_need_required, window_opens, window_closes, window_confirmed, academic_year, notes",
    )
    .eq("window_confirmed", true);

  if (error) return [] as Bourse[];
  return (data ?? []) as unknown as Bourse[];
});
