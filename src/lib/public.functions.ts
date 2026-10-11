import { createServerFn } from "@tanstack/react-start";

/** Témoignages publiés (vérifiés et avec accord écrit) : page publique et accueil. */
export const listLaureates = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("laureates")
    .select("id, first_name, country, bourse_name, year, quote, video_url, is_demo")
    .eq("verified", true)
    .not("consent_at", "is", null)
    .order("year", { ascending: false })
    .limit(60);
  return data ?? [];
});
