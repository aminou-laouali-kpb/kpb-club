import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { EventName } from "./analytics";

/**
 * Enregistre un événement produit en base et, si une clé est configurée, chez PostHog.
 * Ne bloque jamais l'action principale : une erreur est seulement journalisée.
 */
export async function track(
  profileId: string | null,
  name: EventName,
  props: Record<string, Json | undefined> = {},
) {
  try {
    const { error } = await supabaseAdmin
      .from("events")
      .insert({ profile_id: profileId, name, props: props as Json });
    if (error) console.error("analytics", error.message);
  } catch (e) {
    console.error("analytics", e);
  }

  const key = process.env["POSTHOG_KEY"];
  if (!key) return;
  try {
    const host = (process.env["POSTHOG_HOST"] ?? "https://eu.i.posthog.com").replace(/\/$/, "");
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: name,
        distinct_id: profileId ?? "anonymous",
        properties: props,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("posthog", e);
  }
}
