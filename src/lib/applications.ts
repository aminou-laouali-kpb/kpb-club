/**
 * Logique pure du tracker de candidature : génération de la checklist,
 * score de préparation, prochaine action et statut.
 */

export type RequirementKind = "document" | "essay" | "recommendation" | "form" | "test" | "other";
export type ItemStatus = "todo" | "in_progress" | "done" | "na";
export type ApplicationStatus =
  | "targeting"
  | "preparing"
  | "ready"
  | "submitted"
  | "interview"
  | "accepted"
  | "rejected"
  | "abandoned";

export type Requirement = {
  id?: string | null;
  kind: RequirementKind;
  label: string;
  description?: string | null;
  essay_prompt?: string | null;
  essay_max_words?: number | null;
  document_type?: string | null;
  recommenders_count?: number | null;
  sort_order: number;
  days_before_deadline?: number | null;
};

export type TrackerItem = {
  id?: string;
  kind: RequirementKind;
  label: string;
  status: ItemStatus;
  due_date: string | null;
  sort_order: number | null;
};

const DAY = 86_400_000;

/** Checklist générique, utilisée quand une bourse n'a pas encore d'exigences en base. */
export const DEFAULT_REQUIREMENTS: Requirement[] = [
  {
    kind: "document",
    label: "Passeport valide",
    document_type: "passport",
    sort_order: 1,
    days_before_deadline: 45,
    description: "Valable au moins 6 mois après la date de départ prévue.",
  },
  {
    kind: "document",
    label: "Relevés de notes",
    document_type: "transcript",
    sort_order: 2,
    days_before_deadline: 30,
    description: "Toutes les années du dernier cycle, traduits si nécessaire.",
  },
  {
    kind: "document",
    label: "Dernier diplôme obtenu",
    document_type: "diploma_licence",
    sort_order: 3,
    days_before_deadline: 30,
  },
  {
    kind: "document",
    label: "CV académique",
    document_type: "cv",
    sort_order: 4,
    days_before_deadline: 21,
  },
  {
    kind: "document",
    label: "Lettre de motivation",
    document_type: "motivation_letter",
    sort_order: 5,
    days_before_deadline: 14,
  },
  {
    kind: "essay",
    label: "Essai de candidature",
    sort_order: 6,
    days_before_deadline: 14,
    essay_max_words: 600,
  },
  {
    kind: "recommendation",
    label: "Lettres de recommandation",
    recommenders_count: 2,
    sort_order: 7,
    days_before_deadline: 10,
    description: "Deux enseignants ou encadrants qui vous connaissent bien.",
  },
  {
    kind: "form",
    label: "Formulaire de candidature en ligne",
    sort_order: 8,
    days_before_deadline: 3,
    description: "À remplir sur le site officiel de la bourse.",
  },
];

/** Date ISO (AAAA-MM-JJ) décalée de `days` jours, calculée en UTC pour éviter les sauts de fuseau. */
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY).toISOString().slice(0, 10);
}

/** Génère les items d'une candidature depuis les exigences de la bourse. */
export function buildItems(requirements: Requirement[], deadline: string | null) {
  return [...requirements]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      requirement_id: r.id ?? null,
      kind: r.kind,
      label: r.label,
      description: r.description ?? null,
      essay_prompt: r.essay_prompt ?? null,
      essay_max_words: r.essay_max_words ?? null,
      document_type: r.document_type ?? null,
      recommenders_count: r.recommenders_count ?? null,
      status: "todo" as ItemStatus,
      sort_order: r.sort_order,
      due_date:
        deadline && r.days_before_deadline != null
          ? shiftDate(deadline, -r.days_before_deadline)
          : deadline
            ? deadline.slice(0, 10)
            : null,
    }));
}

/** Score de préparation : done / (total − na), en pourcentage arrondi. */
export function computeReadiness(items: Pick<TrackerItem, "status">[]): number {
  const relevant = items.filter((i) => i.status !== "na");
  if (relevant.length === 0) return 0;
  const done = relevant.filter((i) => i.status === "done").length;
  return Math.round((done / relevant.length) * 100);
}

export const SUBMIT_ACTION = "Soumettre ta candidature";

/** Premier item à faire, par échéance (sans date en dernier), puis par ordre. */
export function computeNextAction<T extends TrackerItem>(items: T[]) {
  const open = items
    .filter((i) => i.status === "todo" || i.status === "in_progress")
    .sort((a, b) => {
      if (a.due_date !== b.due_date) {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date < b.due_date ? -1 : 1;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  const next = open[0];
  if (!next) return { label: items.length > 0 ? SUBMIT_ACTION : null, item: null };
  return { label: next.label, item: next };
}

/** Statuts posés par l'étudiant : jamais écrasés par le recalcul automatique. */
const MANUAL_STATUSES: ApplicationStatus[] = [
  "submitted",
  "interview",
  "accepted",
  "rejected",
  "abandoned",
];

export function deriveStatus(
  current: ApplicationStatus,
  readiness: number,
  items: Pick<TrackerItem, "status">[],
): ApplicationStatus {
  if (MANUAL_STATUSES.includes(current)) return current;
  if (items.length > 0 && readiness >= 100) return "ready";
  if (items.some((i) => i.status === "done" || i.status === "in_progress")) return "preparing";
  return "targeting";
}

export function isActiveStatus(status: ApplicationStatus) {
  return !["accepted", "rejected", "abandoned"].includes(status);
}

/** Jours restants jusqu'à une date : 0 le jour même, négatif si dépassée. */
export function daysUntil(date: string | null, now = Date.now()): number | null {
  if (!date) return null;
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / DAY);
}

export function deadlineLabel(deadline: string | null) {
  const days = daysUntil(deadline);
  if (days === null) return "Date limite non communiquée";
  if (days < 0) return "Date limite dépassée";
  if (days === 0) return "Date limite aujourd'hui";
  return `J-${days}`;
}

export const KIND_LABELS: Record<RequirementKind, string> = {
  document: "Documents",
  essay: "Essais",
  recommendation: "Recommandations",
  form: "Formulaires",
  test: "Tests",
  other: "Autres",
};

const KIND_ORDER: RequirementKind[] = [
  "document",
  "essay",
  "recommendation",
  "form",
  "test",
  "other",
];

export function groupItemsByKind<T extends Pick<TrackerItem, "kind">>(items: T[]) {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    items: items.filter((i) => i.kind === kind),
  })).filter((g) => g.items.length > 0);
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  targeting: "Ciblée",
  preparing: "En préparation",
  ready: "Prête",
  submitted: "Soumise",
  interview: "Entretien",
  accepted: "Acceptée",
  rejected: "Refusée",
  abandoned: "Abandonnée",
};

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
