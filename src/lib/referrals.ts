/** Parrainage : codes, liens et calcul des récompenses. */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRALS_PER_REWARD = 2;
export const REWARD_DAYS = 30;
export const REFERRAL_ATTACH_MAX_AGE_DAYS = 30;

export function generateReferralCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `KPB-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** Accepte « kpb-abc234 », « KPBABC234 » ou « abc234 ». */
export function normalizeReferralCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("KPB") && raw.length === 9 ? raw.slice(3) : raw;
  if (body.length !== 6 || ![...body].every((c) => ALPHABET.includes(c))) return null;
  return `KPB-${body}`;
}

export function referralLink(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/?ref=${encodeURIComponent(code)}`;
}

/**
 * Récompenses dues : une par paire de filleuls payés et non encore récompensés,
 * en consommant les plus anciens d'abord.
 */
export function rewardsDue(paidNotRewarded: { id: string; paid_at: string | null }[]) {
  const sorted = [...paidNotRewarded].sort((a, b) =>
    (a.paid_at ?? "").localeCompare(b.paid_at ?? ""),
  );
  const rewards = Math.floor(sorted.length / REFERRALS_PER_REWARD);
  const batches: string[][] = [];
  for (let i = 0; i < rewards; i++) {
    batches.push(
      sorted.slice(i * REFERRALS_PER_REWARD, (i + 1) * REFERRALS_PER_REWARD).map((r) => r.id),
    );
  }
  return batches;
}

/** Progression vers la prochaine récompense (0 ou 1 sur 2). */
export function progressToNextReward(paidCount: number, rewardedCount: number) {
  return (paidCount + rewardedCount) % REFERRALS_PER_REWARD;
}
