/** Parcours anglais : auto-évaluation et comparaison avec les exigences des bourses. */

export type EnglishTest = "ielts" | "toefl" | "duolingo";
export type Level = "A2" | "B1" | "B2" | "C1";

export const SELF_ASSESSMENT: { question: string; options: string[]; answer: number }[] = [
  { question: "She ___ to Niamey last year.", options: ["go", "went", "gone", "goes"], answer: 1 },
  {
    question: "I have lived here ___ 2019.",
    options: ["for", "since", "during", "from"],
    answer: 1,
  },
  {
    question: "If I ___ the scholarship, I will study in Canada.",
    options: ["get", "got", "will get", "would get"],
    answer: 0,
  },
  {
    question: "The report ___ by the committee next week.",
    options: ["will review", "will be reviewed", "is reviewing", "reviewed"],
    answer: 1,
  },
  {
    question: "Choose the closest meaning of « thorough ».",
    options: ["quick", "careful and complete", "difficult", "expensive"],
    answer: 1,
  },
  {
    question: "She asked me where ___.",
    options: ["did I live", "I lived", "do I live", "I am live"],
    answer: 1,
  },
  {
    question: "Had I known, I ___ earlier.",
    options: ["would come", "will come", "would have come", "came"],
    answer: 2,
  },
  {
    question: "« To bridge a gap » means…",
    options: ["to build a road", "to reduce a difference", "to cross a river", "to make a mistake"],
    answer: 1,
  },
  {
    question: "Which sentence is correct?",
    options: [
      "Despite of the rain, we went.",
      "Despite the rain, we went.",
      "Despite it rained, we went.",
      "Despite raining we go.",
    ],
    answer: 1,
  },
  {
    question: "« Notwithstanding » is closest to…",
    options: ["because of", "in spite of", "in addition to", "instead of"],
    answer: 1,
  },
];

export function assessLevel(answers: number[]): { score: number; level: Level } {
  const score = SELF_ASSESSMENT.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  const level: Level = score >= 9 ? "C1" : score >= 7 ? "B2" : score >= 4 ? "B1" : "A2";
  return { score, level };
}

/** Équivalences indicatives entre tests (tableaux publics IELTS/TOEFL/Duolingo, arrondis). */
const TO_IELTS: Record<EnglishTest, [number, number][]> = {
  ielts: [],
  toefl: [
    [110, 8],
    [102, 7.5],
    [94, 7],
    [79, 6.5],
    [60, 6],
    [46, 5.5],
    [35, 5],
  ],
  duolingo: [
    [140, 8],
    [130, 7.5],
    [120, 7],
    [115, 6.5],
    [105, 6],
    [95, 5.5],
    [85, 5],
  ],
};

export function toIelts(test: EnglishTest, score: number): number {
  if (test === "ielts") return score;
  const row = TO_IELTS[test].find(([min]) => score >= min);
  return row ? row[1] : 4.5;
}

export type Requirement = { test: EnglishTest; min_score: number };

/** Le score déclaré suffit-il ? Comparaison en équivalent IELTS si le test diffère. */
export function requirementGap(
  declared: { test: EnglishTest | "none" | null; score: number | null },
  requirements: Requirement[],
) {
  if (requirements.length === 0) return { status: "none" as const };
  if (!declared.test || declared.test === "none" || declared.score === null) {
    return { status: "missing" as const, requirements };
  }
  const own = toIelts(declared.test, declared.score);
  const needed = Math.min(...requirements.map((r) => toIelts(r.test, r.min_score)));
  const same = requirements.find((r) => r.test === declared.test);
  if (same) {
    return declared.score >= same.min_score
      ? { status: "ok" as const }
      : {
          status: "short" as const,
          gap: Math.round((same.min_score - declared.score) * 10) / 10,
          test: same.test,
        };
  }
  return own >= needed
    ? { status: "ok" as const }
    : {
        status: "short" as const,
        gap: Math.round((needed - own) * 10) / 10,
        test: "ielts" as const,
      };
}

/** Sessions dont les résultats arrivent avant la date limite, triées par date. */
export function usefulSessions<
  T extends { session_date: string; results_days: number | null; test: string },
>(sessions: T[], deadline: string | null, today = new Date().toISOString().slice(0, 10)) {
  return sessions
    .filter((s) => s.session_date >= today)
    .filter((s) => {
      if (!deadline) return true;
      const results =
        new Date(`${s.session_date}T00:00:00Z`).getTime() + (s.results_days ?? 14) * 86_400_000;
      return results <= new Date(`${deadline}T23:59:59Z`).getTime();
    })
    .sort((a, b) => a.session_date.localeCompare(b.session_date));
}
