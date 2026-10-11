/** Recherche des extraits du guide et des bourses pour les questions-réponses. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function searchKnowledge(question: string, limit = 5) {
  const { data, error } = await supabaseAdmin.rpc("search_knowledge", {
    _query: question.slice(0, 300),
    _limit: limit,
  });
  if (error) {
    console.error("search_knowledge", error);
    return [];
  }
  return (data ?? []).map((r) => ({ title: r.title, content: r.content.slice(0, 1_500) }));
}
