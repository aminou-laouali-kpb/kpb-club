import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recomputeApplication } from "./applications.server";
import { isRecommendationItemDone } from "./recommenders";

export const DOCUMENTS_BUCKET = "documents";

/**
 * Lie un document aux items de checklist : à l'item visé s'il est précisé,
 * sinon à tous les items vides du membre qui attendent ce type de pièce.
 * Les items liés passent « fait » et les candidatures sont recalculées.
 */
export async function linkDocumentToItems(
  profileId: string,
  documentId: string,
  type: string,
  itemId?: string | null,
) {
  const { data: apps } = await supabaseAdmin
    .from("applications")
    .select("id")
    .eq("profile_id", profileId);
  const appIds = (apps ?? []).map((a) => a.id);
  if (appIds.length === 0) return 0;

  let query = supabaseAdmin
    .from("application_items")
    .select("id, application_id")
    .in("application_id", appIds)
    .eq("kind", "document");
  query = itemId
    ? query.eq("id", itemId)
    : query.eq("document_type", type).is("document_id", null).neq("status", "na");
  const { data: items } = await query;
  if (!items || items.length === 0) return 0;

  const { error } = await supabaseAdmin
    .from("application_items")
    .update({ document_id: documentId, status: "done", completed_at: new Date().toISOString() })
    .in(
      "id",
      items.map((i) => i.id),
    );
  if (error) throw new Error(error.message);

  for (const appId of new Set(items.map((i) => i.application_id))) {
    await recomputeApplication(appId);
  }
  return items.length;
}

/** À la création d'une candidature : relie les pièces déjà présentes dans le coffre-fort. */
export async function linkExistingDocuments(profileId: string, applicationId: string) {
  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("id, type, expires_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (!docs || docs.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await supabaseAdmin
    .from("application_items")
    .select("id, document_type")
    .eq("application_id", applicationId)
    .eq("kind", "document")
    .is("document_id", null);

  let linked = 0;
  for (const item of items ?? []) {
    // Document le plus récent du bon type, et pas expiré
    const doc = docs.find(
      (d) => d.type === item.document_type && (!d.expires_at || d.expires_at >= today),
    );
    if (!doc) continue;
    await supabaseAdmin
      .from("application_items")
      .update({ document_id: doc.id, status: "done", completed_at: new Date().toISOString() })
      .eq("id", item.id);
    linked += 1;
  }
  if (linked > 0) await recomputeApplication(applicationId);
}

/** Lettre reçue : le recommandateur passe « reçue » et l'item est coché si le compte y est. */
export async function markRecommendationReceived(
  profileId: string,
  recommenderId: string,
  documentId: string,
) {
  const { data: rec } = await supabaseAdmin
    .from("recommenders")
    .update({ status: "received", received_at: new Date().toISOString(), document_id: documentId })
    .eq("id", recommenderId)
    .eq("profile_id", profileId)
    .select("application_id")
    .maybeSingle();
  if (rec?.application_id) await syncRecommendationItems(rec.application_id);
}

export async function syncRecommendationItems(applicationId: string) {
  const [{ count }, { data: items }] = await Promise.all([
    supabaseAdmin
      .from("recommenders")
      .select("id", { count: "exact", head: true })
      .eq("application_id", applicationId)
      .eq("status", "received"),
    supabaseAdmin
      .from("application_items")
      .select("id, status, recommenders_count")
      .eq("application_id", applicationId)
      .eq("kind", "recommendation"),
  ]);
  let changed = false;
  for (const item of items ?? []) {
    if (item.status === "na") continue;
    const done = isRecommendationItemDone(count ?? 0, item.recommenders_count);
    const next = done
      ? "done"
      : (count ?? 0) > 0
        ? "in_progress"
        : item.status === "done"
          ? "todo"
          : item.status;
    if (next !== item.status) {
      await supabaseAdmin
        .from("application_items")
        .update({ status: next, completed_at: next === "done" ? new Date().toISOString() : null })
        .eq("id", item.id);
      changed = true;
    }
  }
  if (changed) await recomputeApplication(applicationId);
}

/** Suppression d'un document : fichier, ligne, et items liés remis « à faire ». */
export async function removeDocument(profileId: string, documentId: string) {
  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!doc) throw new Error("Document introuvable");

  const { data: items } = await supabaseAdmin
    .from("application_items")
    .select("id, application_id")
    .eq("document_id", doc.id);
  if (items && items.length > 0) {
    await supabaseAdmin
      .from("application_items")
      .update({ document_id: null, status: "todo", completed_at: null })
      .in(
        "id",
        items.map((i) => i.id),
      );
  }
  const { data: recs } = await supabaseAdmin
    .from("recommenders")
    .select("id, application_id")
    .eq("document_id", doc.id);
  if (recs && recs.length > 0) {
    await supabaseAdmin
      .from("recommenders")
      .update({ document_id: null, status: "requested", received_at: null })
      .in(
        "id",
        recs.map((r) => r.id),
      );
  }

  await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  const { error } = await supabaseAdmin.from("documents").delete().eq("id", doc.id);
  if (error) throw new Error(error.message);

  for (const appId of new Set((items ?? []).map((i) => i.application_id))) {
    await recomputeApplication(appId);
  }
  for (const appId of new Set((recs ?? []).map((r) => r.application_id).filter(Boolean))) {
    await syncRecommendationItems(appId as string);
  }
}
