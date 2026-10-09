import { describe, expect, test } from "bun:test";
import {
  SUBMIT_ACTION,
  buildItems,
  computeNextAction,
  computeReadiness,
  daysUntil,
  deriveStatus,
  groupItemsByKind,
  type TrackerItem,
} from "../src/lib/applications";

const item = (over: Partial<TrackerItem>): TrackerItem => ({
  kind: "document",
  label: "x",
  status: "todo",
  due_date: null,
  sort_order: 0,
  ...over,
});

describe("génération de la checklist", () => {
  test("échéances calculées depuis la date limite, ordre respecté", () => {
    const items = buildItems(
      [
        { kind: "essay", label: "Essai", sort_order: 2, days_before_deadline: 14 },
        { kind: "document", label: "Passeport", sort_order: 1, days_before_deadline: 45 },
        { kind: "form", label: "Formulaire", sort_order: 3 },
      ],
      "2027-01-15",
    );
    expect(items.map((i) => i.label)).toEqual(["Passeport", "Essai", "Formulaire"]);
    expect(items.map((i) => i.due_date)).toEqual(["2026-12-01", "2027-01-01", "2027-01-15"]);
    expect(items.every((i) => i.status === "todo")).toBe(true);
  });

  test("sans date limite : pas d'échéance", () => {
    const [i] = buildItems(
      [{ kind: "test", label: "IELTS", sort_order: 1, days_before_deadline: 30 }],
      null,
    );
    expect(i.due_date).toBeNull();
  });
});

describe("score de préparation", () => {
  test("ignore les items non applicables", () => {
    expect(
      computeReadiness([
        { status: "done" },
        { status: "todo" },
        { status: "na" },
        { status: "done" },
      ]),
    ).toBe(67);
  });
  test("liste vide ou tout na : 0", () => {
    expect(computeReadiness([])).toBe(0);
    expect(computeReadiness([{ status: "na" }])).toBe(0);
  });
  test("tout fait : 100", () => {
    expect(computeReadiness([{ status: "done" }, { status: "na" }])).toBe(100);
  });
});

describe("prochaine action", () => {
  test("échéance la plus proche d'abord, sans date en dernier", () => {
    const items = [
      item({ label: "Sans date", sort_order: 1 }),
      item({ label: "Tard", due_date: "2027-01-10", sort_order: 2 }),
      item({ label: "Tôt", due_date: "2026-12-01", sort_order: 3, status: "in_progress" }),
      item({ label: "Fait", due_date: "2026-11-01", status: "done" }),
    ];
    expect(computeNextAction(items).label).toBe("Tôt");
  });
  test("à égalité de date, l'ordre de la checklist", () => {
    const items = [
      item({ label: "B", due_date: "2026-12-01", sort_order: 2 }),
      item({ label: "A", due_date: "2026-12-01", sort_order: 1 }),
    ];
    expect(computeNextAction(items).label).toBe("A");
  });
  test("tout est fait : soumettre", () => {
    expect(computeNextAction([item({ status: "done" }), item({ status: "na" })]).label).toBe(
      SUBMIT_ACTION,
    );
    expect(computeNextAction([]).label).toBeNull();
  });
});

describe("statut", () => {
  test("progression automatique", () => {
    expect(deriveStatus("targeting", 0, [{ status: "todo" }])).toBe("targeting");
    expect(deriveStatus("targeting", 0, [{ status: "in_progress" }])).toBe("preparing");
    expect(deriveStatus("preparing", 100, [{ status: "done" }])).toBe("ready");
    expect(deriveStatus("ready", 50, [{ status: "done" }, { status: "todo" }])).toBe("preparing");
  });
  test("un statut posé par l'étudiant n'est jamais écrasé", () => {
    for (const s of ["submitted", "interview", "accepted", "rejected", "abandoned"] as const) {
      expect(deriveStatus(s, 10, [{ status: "todo" }])).toBe(s);
    }
  });
});

describe("affichage", () => {
  test("jours restants", () => {
    const now = Date.UTC(2026, 9, 9, 12);
    expect(daysUntil("2026-10-09", now)).toBe(0);
    expect(daysUntil("2026-10-19", now)).toBe(10);
    expect(daysUntil("2026-10-01", now)).toBeLessThan(0);
    expect(daysUntil(null, now)).toBeNull();
  });
  test("regroupement par type, groupes vides retirés", () => {
    const groups = groupItemsByKind([item({ kind: "essay" }), item({ kind: "document" })]);
    expect(groups.map((g) => g.kind)).toEqual(["document", "essay"]);
  });
});
