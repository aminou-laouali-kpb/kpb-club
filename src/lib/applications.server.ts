import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_REQUIREMENTS,
  buildItems,
  computeNextAction,
  computeReadiness,
  deriveStatus,
  type ApplicationStatus,
  type Requirement,
} from "./applications";

/** Recalcule score, prochaine action et statut d'une candidature après une modification. */
export async function recomputeApplication(applicationId: string) {
  const [{ data: app }, { data: items, error }] = await Promise.all([
    supabaseAdmin.from("applications").select("status").eq("id", applicationId).single(),
    supabaseAdmin
      .from("application_items")
      .select("id, kind, label, status, due_date, sort_order")
      .eq("application_id", applicationId),
  ]);
  if (error) throw new Error(error.message);
  const list = items ?? [];
  const readiness = computeReadiness(list);
  const next = computeNextAction(list);
  const status = deriveStatus((app?.status ?? "targeting") as ApplicationStatus, readiness, list);

  const { error: updateError } = await supabaseAdmin
    .from("applications")
    .update({
      readiness,
      next_action: next.label,
      next_item_id: next.item?.id ?? null,
      status,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", applicationId);
  if (updateError) throw new Error(updateError.message);
  return { readiness, nextAction: next.label, status };
}

/**
 * Crée une candidature et sa checklist. Idempotent : si le membre suit déjà
 * cette bourse, renvoie la candidature existante.
 */
export async function createApplicationFor(profileId: string, bourseId: string) {
  const { data: existing } = await supabaseAdmin
    .from("applications")
    .select("id")
    .eq("profile_id", profileId)
    .eq("bourse_id", bourseId)
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data: bourse } = await supabaseAdmin
    .from("bourses")
    .select("id, window_closes")
    .eq("id", bourseId)
    .maybeSingle();
  if (!bourse) throw new Error("Bourse introuvable");

  const { data: app, error } = await supabaseAdmin
    .from("applications")
    .insert({ profile_id: profileId, bourse_id: bourseId, deadline: bourse.window_closes })
    .select("id")
    .single();
  if (error) {
    // Création concurrente : la contrainte d'unicité a joué, on renvoie l'existante
    if (error.code === "23505") {
      const { data: again } = await supabaseAdmin
        .from("applications")
        .select("id")
        .eq("profile_id", profileId)
        .eq("bourse_id", bourseId)
        .single();
      if (again) return { id: again.id, created: false };
    }
    throw new Error(error.message);
  }

  const { data: requirements } = await supabaseAdmin
    .from("bourse_requirements")
    .select(
      "id, kind, label, description, essay_prompt, essay_max_words, sort_order, days_before_deadline",
    )
    .eq("bourse_id", bourseId);
  const source: Requirement[] =
    requirements && requirements.length > 0 ? requirements : DEFAULT_REQUIREMENTS;

  const items = buildItems(source, bourse.window_closes).map((i) => ({
    ...i,
    application_id: app.id,
  }));
  const { error: itemsError } = await supabaseAdmin.from("application_items").insert(items);
  if (itemsError) {
    await supabaseAdmin.from("applications").delete().eq("id", app.id);
    throw new Error(itemsError.message);
  }

  await recomputeApplication(app.id);
  return { id: app.id, created: true };
}
