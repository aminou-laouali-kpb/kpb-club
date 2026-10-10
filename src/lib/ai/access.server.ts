/** Niveau d'accès, quotas et enregistrement de la consommation IA. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  CHAT_DAILY_LIMIT,
  FEATURE_LABELS,
  isLifetimeQuota,
  monthStart,
  quotaFor,
  remaining,
  type AiFeature,
  type AiTier,
} from "./quotas";
import { AiError, type CallUsage } from "./client.server";

export type AiMember = {
  profileId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  timezone: string;
  tier: AiTier;
  summary: string;
};

const EDUCATION: Record<string, string> = {
  bac: "baccalauréat",
  licence: "licence",
  master: "master",
  doctorat: "doctorat",
  autre: "autre diplôme",
};

/** Profil du membre connecté, son niveau d'accès et un résumé anonyme pour l'IA. */
export async function getAiMember(userId: string): Promise<AiMember> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, full_name, email, phone, timezone, nationality, residence, education, field_of_study, english_level, date_of_birth",
    )
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!profile) throw new AiError("unavailable", "Profil introuvable");

  const now = new Date().toISOString();
  const [{ data: sub }, { data: engagement }] = await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .select("ends_at, grace_ends_at")
      .eq("profile_id", profile.id)
      .neq("status", "cancelled")
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("engagements")
      .select("id")
      .eq("profile_id", profile.id)
      .in("status", ["active", "documents_review", "submitted"])
      .limit(1)
      .maybeSingle(),
  ]);
  const clubActive = Boolean(sub && (sub.grace_ends_at ?? sub.ends_at) >= now);
  const tier: AiTier = engagement ? "accompaniment" : clubActive ? "club" : "free";

  const age = profile.date_of_birth
    ? Math.floor((Date.now() - Date.parse(profile.date_of_birth)) / (365.25 * 86_400_000))
    : null;
  // Résumé sans nom ni coordonnées (spec §12.6)
  const summary = [
    profile.nationality ? `nationalité ${profile.nationality}` : null,
    profile.residence ? `réside en ${profile.residence}` : null,
    age ? `${age} ans` : null,
    profile.education ? `niveau ${EDUCATION[profile.education] ?? profile.education}` : null,
    profile.field_of_study ? `domaine : ${profile.field_of_study}` : null,
    profile.english_level ? `anglais : ${profile.english_level}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    profileId: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    timezone: profile.timezone ?? "Africa/Niamey",
    tier,
    summary: summary || "profil non renseigné",
  };
}

async function countUsage(profileId: string, feature: AiFeature, since: Date | null) {
  // Un entretien compte une fois par session, quel que soit le nombre d'échanges
  if (feature === "interview_sim") {
    let threads = supabaseAdmin
      .from("ai_threads")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("feature", "interview_sim");
    if (since) threads = threads.gte("created_at", since.toISOString());
    const { count } = await threads;
    return count ?? 0;
  }
  let query = supabaseAdmin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("feature", feature);
  if (since) query = query.gte("created_at", since.toISOString());
  const { count } = await query;
  return count ?? 0;
}

/** Reste du quota d'une fonction pour le membre (mensuel, ou « à vie » en gratuit). */
export async function quotaStatus(member: AiMember, feature: AiFeature) {
  const limit = quotaFor(member.tier, feature);
  let since: Date | null;
  if (feature === "doc_classify") since = new Date(Date.now() - 86_400_000);
  else
    since = isLifetimeQuota(member.tier, feature) ? null : monthStart(new Date(), member.timezone);
  const used = await countUsage(member.profileId, feature, since);
  return { limit, used, remaining: remaining(limit, used), lifetime: since === null };
}

/** Bloque l'appel si le quota est épuisé. Le décompte n'a lieu qu'après un succès. */
export async function assertQuota(member: AiMember, feature: AiFeature) {
  const status = await quotaStatus(member, feature);
  if (status.remaining <= 0) {
    const label = FEATURE_LABELS[feature].toLowerCase();
    const message =
      status.limit === 0
        ? `Les ${label} sont réservées aux membres du Club.`
        : member.tier === "free"
          ? `Tu as utilisé ton analyse offerte. Rejoins le Club pour en obtenir 10 par mois.`
          : `Tu as atteint ta limite de ${label} pour ce mois. L'accompagnement KPB en offre davantage.`;
    throw new AiError("rate_limited", message);
  }
  if (feature === "coach_chat") {
    const today = await countUsage(member.profileId, feature, new Date(Date.now() - 86_400_000));
    if (today >= CHAT_DAILY_LIMIT) {
      throw new AiError(
        "rate_limited",
        "Tu as posé beaucoup de questions aujourd'hui. Reviens demain !",
      );
    }
  }
  return status;
}

export async function recordUsage(input: {
  member: AiMember;
  feature: AiFeature;
  usage: CallUsage;
  result?: Json;
  applicationId?: string | null;
  itemId?: string | null;
  threadId?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("ai_usage")
    .insert({
      profile_id: input.member.profileId,
      feature: input.feature,
      model: input.usage.model,
      input_tokens: input.usage.input_tokens,
      output_tokens: input.usage.output_tokens,
      cached_tokens: input.usage.cached_tokens,
      cost_usd: input.usage.cost_usd,
      result: input.result ?? null,
      application_id: input.applicationId ?? null,
      item_id: input.itemId ?? null,
      thread_id: input.threadId ?? null,
    })
    .select("id")
    .single();
  if (error) console.error("ai_usage", error);
  return data?.id ?? null;
}
