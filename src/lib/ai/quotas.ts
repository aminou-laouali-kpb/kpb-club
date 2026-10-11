/** Quotas mensuels du coach IA (spec §12.4). */
import { DEFAULT_TIMEZONE, isValidTimezone } from "../relance/window";

export type AiFeature =
  "essay_review" | "cv_review" | "interview_sim" | "coach_chat" | "doc_classify";
export type AiTier = "free" | "club" | "accompaniment";

export const QUOTAS: Record<AiTier, Record<Exclude<AiFeature, "doc_classify">, number>> = {
  free: { essay_review: 1, cv_review: 0, interview_sim: 0, coach_chat: 0 },
  club: { essay_review: 10, cv_review: 3, interview_sim: 2, coach_chat: 100 },
  accompaniment: { essay_review: 30, cv_review: 10, interview_sim: 6, coach_chat: 300 },
};

/** La classification de document n'est pas facturée au membre : plafond anti-abus seulement. */
export const DOC_CLASSIFY_DAILY_LIMIT = 30;
/** Plafond quotidien du chat, en plus du quota mensuel (spec §11). */
export const CHAT_DAILY_LIMIT = 20;

export const FEATURE_LABELS: Record<AiFeature, string> = {
  essay_review: "Analyses d'essai",
  cv_review: "Revues de CV",
  interview_sim: "Simulations d'entretien",
  coach_chat: "Questions au coach",
  doc_classify: "Classements de documents",
};

/** En gratuit, l'analyse d'essai offerte l'est « à vie » et non par mois. */
export function isLifetimeQuota(tier: AiTier, feature: AiFeature) {
  return tier === "free" && feature === "essay_review";
}

export function quotaFor(tier: AiTier, feature: AiFeature): number {
  if (feature === "doc_classify") return DOC_CLASSIFY_DAILY_LIMIT;
  return QUOTAS[tier][feature];
}

/** 1er du mois à minuit dans le fuseau du membre, en instant UTC. */
export function monthStart(now: Date, timezone: string | null | undefined): Date {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  // Décalage du fuseau à cette date : minuit local = minuit UTC − décalage
  const guess = new Date(Date.UTC(year, month - 1, 1));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

export function remaining(limit: number, used: number) {
  return Math.max(0, limit - used);
}
