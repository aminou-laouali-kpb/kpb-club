/** Règles de relance : décident quoi envoyer et quand, sans effet de bord. */

const DAY = 86_400_000;

function dayDiff(dateIso: string, now: Date) {
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const target = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / DAY);
}

export type SecondInstallmentKind = "t2_j5" | "t2_j1" | "t2_j0" | "t2_jp3";

export const SECOND_INSTALLMENT_FLAGS: Record<SecondInstallmentKind, string> = {
  t2_j5: "reminder_t2_j5_sent",
  t2_j1: "reminder_t2_j1_sent",
  t2_j0: "reminder_t2_j0_sent",
  t2_jp3: "reminder_t2_jp3_sent",
};

/** Relance de 2e tranche : J-5, J-1, J0, J+3, chacune une seule fois. */
export function secondInstallmentReminder(
  dueDate: string | null,
  now: Date,
  flags: Partial<Record<string, boolean>>,
): SecondInstallmentKind | null {
  if (!dueDate) return null;
  const d = dayDiff(dueDate, now);
  const pick = (kind: SecondInstallmentKind) =>
    flags[SECOND_INSTALLMENT_FLAGS[kind]] ? null : kind;
  if (d === 5) return pick("t2_j5");
  if (d === 1) return pick("t2_j1");
  if (d === 0) return pick("t2_j0");
  if (d <= -3 && d >= -10) return pick("t2_jp3");
  return null;
}

export const NUDGE_HORIZON_DAYS = 7;
export const NUDGE_IDLE_DAYS = 5;
export const INACTIVITY_DAYS = 14;

/** Relance d'engagement : un item est dû sous 7 jours et rien n'a bougé depuis 5 jours. */
export function engagementNudgeDue(
  item: { status: string; due_date: string | null },
  lastActivity: string | null,
  now: Date,
) {
  if (item.status !== "todo" && item.status !== "in_progress") return false;
  if (!item.due_date) return false;
  const d = dayDiff(item.due_date, now);
  if (d < 0 || d > NUDGE_HORIZON_DAYS) return false;
  if (!lastActivity) return true;
  return now.getTime() - Date.parse(lastActivity) >= NUDGE_IDLE_DAYS * DAY;
}

/** Semaine ISO (AAAA-Wnn) : sert à n'envoyer qu'une relance d'engagement par semaine. */
export function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Relance d'inactivité : 14 jours sans connexion. La clé renvoyée change à chaque
 * nouvelle période d'inactivité, pour n'envoyer qu'un message par période.
 */
export function inactivityDue(lastSeen: string | null, now: Date) {
  if (!lastSeen) return null;
  if (now.getTime() - Date.parse(lastSeen) < INACTIVITY_DAYS * DAY) return null;
  return lastSeen.slice(0, 10);
}
