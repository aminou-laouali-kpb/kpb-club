const DAY = 86_400_000;
export const GRACE_DAYS = 3;

/**
 * Calcule la nouvelle période d'accès : on prolonge depuis la fin de l'abonnement
 * en cours s'il est encore actif, sinon depuis maintenant.
 */
export function computeExtension(currentEndsAt: string | null, days: number, now = Date.now()) {
  const currentEnd = currentEndsAt ? new Date(currentEndsAt).getTime() : 0;
  const base = currentEnd > now ? currentEnd : now;
  const endsAt = new Date(base + days * DAY);
  const graceEndsAt = new Date(endsAt.getTime() + GRACE_DAYS * DAY);
  return { endsAt, graceEndsAt };
}
