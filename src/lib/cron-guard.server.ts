import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Vérifie le jeton porté par les tâches planifiées. Renvoie une réponse 401 si invalide. */
export async function guardCronRequest(request: Request): Promise<Response | null> {
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabaseAdmin.rpc("verify_cron_token", { _token: token });
  if (error || data !== true) return new Response("Unauthorized", { status: 401 });
  return null;
}
