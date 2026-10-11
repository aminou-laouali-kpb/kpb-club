import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DOCUMENTS_BUCKET } from "./documents.server";
import { DELETION_DELAY_DAYS } from "./privacy";

/** Tous les fichiers du membre dans le coffre-fort (dossier `<profile_id>/`). */
async function storagePaths(profileId: string) {
  const paths = new Set<string>();
  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("storage_path")
    .eq("profile_id", profileId);
  for (const d of docs ?? []) paths.add(d.storage_path);
  for (let offset = 0; ; offset += 100) {
    const { data: files } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .list(profileId, { limit: 100, offset });
    if (!files || files.length === 0) break;
    for (const f of files) paths.add(`${profileId}/${f.name}`);
    if (files.length < 100) break;
  }
  return [...paths];
}

/**
 * Efface définitivement un compte : fichiers, profil (et tout ce qui en dépend
 * en cascade : candidatures, essais, documents, fils du coach, notifications),
 * compte de connexion et traces WhatsApp. Les paiements, engagements et coûts IA
 * restent pour la comptabilité, détachés du membre et sans données personnelles.
 */
export async function purgeAccount(profileId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, auth_user_id, phone_e164")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return { deleted: false };

  const paths = await storagePaths(profileId);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .remove(paths.slice(i, i + 100));
    if (error) throw new Error(`Suppression des fichiers : ${error.message}`);
  }

  // Ce qui survit au compte ne garde aucun contenu personnel
  await supabaseAdmin.from("ai_usage").update({ result: null }).eq("profile_id", profileId);
  await supabaseAdmin
    .from("payments")
    .update({ metadata: { anonymized: true } })
    .eq("profile_id", profileId);
  await supabaseAdmin.from("engagements").update({ notes: null }).eq("profile_id", profileId);

  if (profile.phone_e164) {
    await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_e164", profile.phone_e164);
    await supabaseAdmin.from("whatsapp_inbound").delete().eq("phone_e164", profile.phone_e164);
    await supabaseAdmin.from("otp_codes").delete().eq("phone_e164", profile.phone_e164);
  }

  const { error } = await supabaseAdmin.from("profiles").delete().eq("id", profileId);
  if (error) throw new Error(error.message);
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(profile.auth_user_id);
  if (authError && !/not.?found/i.test(authError.message)) throw new Error(authError.message);
  return { deleted: true, files: paths.length };
}

/** Job quotidien : efface les comptes dont la demande a plus de 7 jours. */
export async function purgeDueAccounts(now = new Date()) {
  const cutoff = new Date(now.getTime() - DELETION_DELAY_DAYS * 86_400_000).toISOString();
  const { data: due } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .not("deletion_requested_at", "is", null)
    .lte("deletion_requested_at", cutoff)
    .limit(50);
  let deleted = 0;
  for (const p of due ?? []) {
    try {
      if ((await purgeAccount(p.id)).deleted) deleted += 1;
    } catch (e) {
      console.error("purge", p.id, e);
    }
  }
  return deleted;
}
