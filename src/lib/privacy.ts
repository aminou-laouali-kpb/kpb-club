/** Règles de consentement et de suppression de compte (spec §20, CA-23). */

export const CONSENT_VERSION = "2026-10";
export const DELETION_DELAY_DAYS = 7;
const DAY = 86_400_000;

/** Date à laquelle un compte dont la suppression est demandée sera effacé. */
export function deletionDueAt(requestedAt: string | Date): Date {
  return new Date(new Date(requestedAt).getTime() + DELETION_DELAY_DAYS * DAY);
}

export function isDeletionDue(requestedAt: string | null, now = new Date()): boolean {
  if (!requestedAt) return false;
  return deletionDueAt(requestedAt).getTime() <= now.getTime();
}

/** Le membre doit (re)donner son accord si la version des conditions a changé. */
export function needsConsent(p: { consent_at: string | null; consent_version: string | null }) {
  return !p.consent_at || p.consent_version !== CONSENT_VERSION;
}

/** Phrase à recopier pour confirmer la suppression. */
export const DELETION_CONFIRM_WORD = "SUPPRIMER";
