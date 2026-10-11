/** Indicateurs du tableau de bord admin (calcul pur, testé). */
import { FEATURE_EVENTS } from "./analytics";
import { PRICING, type ClubPlan } from "./pricing";

const DAY = 86_400_000;

export type Sub = {
  id: string;
  profile_id: string | null;
  plan: string;
  amount: number;
  ends_at: string;
  grace_ends_at: string | null;
  status?: string;
  source?: string | null;
};

export type Evt = { profile_id: string | null; name: string; created_at: string };

const t = (iso: string) => new Date(iso).getTime();
const accessEnd = (s: Sub) => t(s.grace_ends_at ?? s.ends_at);
const planDays = (plan: string) => PRICING.club[plan as ClubPlan]?.duration_days ?? 30;
/** Période couverte par une ligne d'abonnement (les prolongations s'empilent après la précédente). */
const coverStart = (s: Sub) => t(s.ends_at) - planDays(s.plan) * DAY;
const live = (subs: Sub[]) => subs.filter((s) => s.status !== "cancelled" && s.profile_id);

export function monthKey(d: Date | string) {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Dernière ligne (fin d'accès la plus lointaine) par membre. */
export function latestByProfile(subs: Sub[]) {
  const latest = new Map<string, Sub>();
  for (const s of live(subs)) {
    const prev = latest.get(s.profile_id!);
    if (!prev || accessEnd(s) > accessEnd(prev)) latest.set(s.profile_id!, s);
  }
  return latest;
}

/** Membres avec un accès Club en cours (délai de grâce compris). */
export function activeMembers(subs: Sub[], now = new Date()) {
  const ids = new Set<string>();
  for (const s of live(subs)) {
    if (coverStart(s) <= now.getTime() && now.getTime() <= accessEnd(s)) ids.add(s.profile_id!);
  }
  return ids.size;
}

/** Revenu mensuel récurrent : abonnements payés en cours, ramenés à 30 jours. */
export function mrr(subs: Sub[], now = new Date()) {
  let total = 0;
  for (const s of live(subs)) {
    if (s.amount <= 0) continue;
    if (coverStart(s) <= now.getTime() && now.getTime() <= t(s.ends_at)) {
      total += (s.amount * 30) / planDays(s.plan);
    }
  }
  return Math.round(total);
}

/** Membres dont l'accès se termine dans les `days` prochains jours, sans prolongation. */
export function renewalsDue(subs: Sub[], now = new Date(), days = 7) {
  let count = 0;
  for (const s of latestByProfile(subs).values()) {
    const end = t(s.ends_at);
    if (end > now.getTime() && end <= now.getTime() + days * DAY) count += 1;
  }
  return count;
}

/** Churn du mois : membres actifs au 1er du mois dont l'accès s'est terminé depuis, sans renouvellement. */
export function monthlyChurn(subs: Sub[], now = new Date()) {
  const start = monthStart(now).getTime();
  const activeAtStart = new Set<string>();
  for (const s of live(subs)) {
    if (coverStart(s) <= start && start <= accessEnd(s)) activeAtStart.add(s.profile_id!);
  }
  const latest = latestByProfile(subs);
  let churned = 0;
  for (const id of activeAtStart) {
    const end = accessEnd(latest.get(id)!);
    if (end >= start && end < now.getTime()) churned += 1;
  }
  return {
    activeAtStart: activeAtStart.size,
    churned,
    rate: activeAtStart.size ? Math.round((churned / activeAtStart.size) * 1000) / 10 : 0,
  };
}

/**
 * Membres à déclarer « churned » : accès terminé depuis au moins `afterDays` jours
 * (au plus 30 jours de plus, pour ne pas remonter tout l'historique), pas encore signalés.
 */
export function findChurned(
  subs: Sub[],
  alreadyReported: Set<string>,
  now = new Date(),
  afterDays = 7,
) {
  const out: { profile_id: string; subscription_id: string }[] = [];
  for (const s of latestByProfile(subs).values()) {
    const end = accessEnd(s);
    const age = now.getTime() - end;
    if (age >= afterDays * DAY && age < (afterDays + 30) * DAY && !alreadyReported.has(s.id)) {
      out.push({ profile_id: s.profile_id!, subscription_id: s.id });
    }
  }
  return out;
}

/** Rétention par cohorte mensuelle d'inscription : part des membres actifs (un événement) chaque mois. */
export function cohortRetention(
  profiles: { id: string; created_at: string }[],
  events: Evt[],
  now = new Date(),
  months = 6,
) {
  const activity = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.profile_id || e.name === "signup") continue;
    const set = activity.get(e.profile_id) ?? new Set<string>();
    set.add(monthKey(e.created_at));
    activity.set(e.profile_id, set);
  }
  const current = monthStart(now);
  const rows: { cohort: string; size: number; retention: (number | null)[] }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const cohortDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - i, 1));
    const cohort = monthKey(cohortDate);
    const members = profiles.filter((p) => monthKey(p.created_at) === cohort);
    const retention: (number | null)[] = [];
    for (let k = 0; k <= i; k += 1) {
      const target = monthKey(
        new Date(Date.UTC(cohortDate.getUTCFullYear(), cohortDate.getUTCMonth() + k, 1)),
      );
      if (members.length === 0) {
        retention.push(null);
        continue;
      }
      const activeCount = members.filter((m) => activity.get(m.id)?.has(target)).length;
      retention.push(Math.round((activeCount / members.length) * 100));
    }
    rows.push({ cohort, size: members.length, retention });
  }
  return rows;
}

/** Entonnoir gratuit → Club → accompagnement. */
export function funnel(input: {
  profileIds: string[];
  clubProfileIds: Iterable<string | null>;
  accompanimentProfileIds: Iterable<string | null>;
}) {
  const all = new Set(input.profileIds);
  const club = new Set([...input.clubProfileIds].filter((id): id is string => !!id && all.has(id)));
  const accompaniment = new Set(
    [...input.accompanimentProfileIds].filter((id): id is string => !!id && all.has(id)),
  );
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  return [
    { step: "Inscrits", count: all.size, rate: 100 },
    { step: "Club", count: club.size, rate: pct(club.size, all.size) },
    { step: "Accompagnement", count: accompaniment.size, rate: pct(accompaniment.size, all.size) },
  ];
}

/** Fonctionnalités utilisées dans la semaine précédant chaque churn (nombre de membres concernés). */
export function featuresBeforeChurn(events: Evt[]) {
  const churns = events.filter((e) => e.name === "churned" && e.profile_id);
  const usage = new Map<string, number>(FEATURE_EVENTS.map((f) => [f, 0]));
  for (const c of churns) {
    const end = t(c.created_at);
    // L'événement « churned » arrive 7 jours après la fin d'accès : on regarde la semaine d'avant cette fin
    const windowEnd = end - 7 * DAY;
    const windowStart = windowEnd - 7 * DAY;
    const used = new Set(
      events
        .filter(
          (e) =>
            e.profile_id === c.profile_id &&
            t(e.created_at) >= windowStart &&
            t(e.created_at) <= windowEnd,
        )
        .map((e) => e.name),
    );
    for (const f of FEATURE_EVENTS) if (used.has(f)) usage.set(f, (usage.get(f) ?? 0) + 1);
  }
  return {
    churns: churns.length,
    usage: [...usage.entries()].map(([feature, count]) => ({ feature, count })),
  };
}
