import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { getEnglishOverview } from "@/lib/english.functions";
import { saveProfile, type ProfileInput } from "@/lib/member.functions";
import {
  SELF_ASSESSMENT,
  assessLevel,
  requirementGap,
  usefulSessions,
  type EnglishTest,
} from "@/lib/english";
import { formatDateFr } from "@/lib/matching";
import { ENGLISH_PATH_URL } from "@/lib/contact";

export const Route = createFileRoute("/_authenticated/anglais")({
  head: () => ({
    meta: [
      { title: "Parcours anglais — KPB Education" },
      {
        name: "description",
        content: "Ton niveau, les tests exigés par tes bourses et les prochaines sessions.",
      },
    ],
  }),
  component: Anglais,
});

const TESTS: Record<string, string> = { ielts: "IELTS", toefl: "TOEFL iBT", duolingo: "Duolingo" };

function Anglais() {
  const fetchOverview = useServerFn(getEnglishOverview);
  const save = useServerFn(saveProfile);
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["english"], queryFn: () => fetchOverview() });
  const [answers, setAnswers] = useState<number[]>([]);
  const [test, setTest] = useState<string | null>(null);
  const [score, setScore] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: ProfileInput) => save({ data: payload }),
    onSuccess: () => {
      toast.success("Enregistré");
      void queryClient.invalidateQueries({ queryKey: ["english"] });
    },
    onError: () => toast.error("Enregistrement impossible"),
  });

  if (isPending || !data) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  const p = data.profile;
  const currentTest = test ?? p.english_test ?? "none";
  const currentScore = score ?? p.english_test_score ?? "";
  const declared = {
    test: currentTest as EnglishTest | "none",
    score: currentScore ? Number(currentScore.replace(",", ".")) : null,
  };
  const done = answers.filter((a) => a !== undefined).length === SELF_ASSESSMENT.length;
  const result = done ? assessLevel(answers) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Parcours anglais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Beaucoup de bourses exigent un test d'anglais : vérifie ton niveau, ce qu'il te faut, et
          quand passer le test pour avoir tes résultats à temps.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl font-semibold">Mon test</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">
            Test passé
            <select
              value={currentTest}
              onChange={(e) => setTest(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
            >
              <option value="none">Pas encore</option>
              <option value="ielts">IELTS</option>
              <option value="toefl">TOEFL iBT</option>
              <option value="duolingo">Duolingo</option>
            </select>
          </label>
          {currentTest !== "none" && (
            <label className="text-sm font-medium">
              Score
              <input
                value={currentScore}
                onChange={(e) => setScore(e.target.value)}
                inputMode="decimal"
                placeholder={currentTest === "ielts" ? "ex. 6,5" : "ex. 95"}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
              />
            </label>
          )}
          <div className="flex items-end">
            <button
              onClick={() =>
                saveMutation.mutate({
                  english_test: currentTest as "ielts" | "toefl" | "duolingo" | "none",
                  english_test_score: currentTest === "none" ? null : currentScore || null,
                })
              }
              disabled={saveMutation.isPending}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Ce qu'exigent tes bourses</h2>
        {data.applications.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Ajoute une candidature pour voir ses exigences.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.applications.map((a) => {
              const gap = requirementGap(declared, a.tests);
              const sessions = usefulSessions(data.sessions, a.deadline).slice(0, 3);
              return (
                <li key={a.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                  <p className="font-medium">{a.bourse}</p>
                  {!a.englishRequired && a.tests.length === 0 ? (
                    <p className="mt-1 text-muted-foreground">Pas de test d'anglais exigé.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-muted-foreground">
                        Exigé :{" "}
                        {a.tests.length > 0
                          ? a.tests
                              .map(
                                (t) => `${TESTS[t.test]} ${String(t.min_score).replace(".", ",")}`,
                              )
                              .join(" ou ")
                          : "un test d'anglais (score à vérifier sur le site officiel)"}
                      </p>
                      {gap.status === "ok" && (
                        <p className="mt-2 flex items-center gap-1.5 text-primary">
                          <CheckCircle2 className="size-4" /> Ton score suffit.
                        </p>
                      )}
                      {gap.status === "short" && (
                        <p className="mt-2 flex items-center gap-1.5 text-destructive">
                          <AlertTriangle className="size-4" /> Il te manque environ{" "}
                          {String(gap.gap).replace(".", ",")} point(s) en {TESTS[gap.test]}.
                        </p>
                      )}
                      {gap.status === "missing" && (
                        <p className="mt-2 flex items-center gap-1.5 text-destructive">
                          <AlertTriangle className="size-4" /> Test à passer avant le{" "}
                          {formatDateFr(a.deadline)}.
                        </p>
                      )}
                      {gap.status !== "ok" && (
                        <div className="mt-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Sessions avec résultats à temps
                          </p>
                          {sessions.length === 0 ? (
                            <p className="mt-1 text-muted-foreground">
                              Aucune session connue avant la date limite. Duolingo se passe à
                              domicile en 2 jours.
                            </p>
                          ) : (
                            <ul className="mt-1 space-y-1">
                              {sessions.map((s) => (
                                <li key={s.id}>
                                  {TESTS[s.test]} · {s.city} · {formatDateFr(s.session_date)}
                                  {s.register_by
                                    ? ` (inscription avant le ${formatDateFr(s.register_by)})`
                                    : ""}
                                  {s.cost_indicative ? ` · ${s.cost_indicative}` : ""}
                                  {s.results_days ? ` · résultats en ${s.results_days} j` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl font-semibold">Auto-évaluation (10 questions)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Une estimation rapide pour savoir par où commencer. Elle ne remplace pas un test officiel.
        </p>
        <ol className="mt-4 space-y-4">
          {SELF_ASSESSMENT.map((q, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium">
                {i + 1}. {q.question}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {q.options.map((o, j) => (
                  <label
                    key={j}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
                      answers[i] === j ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q${i}`}
                      checked={answers[i] === j}
                      onChange={() =>
                        setAnswers((cur) => {
                          const copy = [...cur];
                          copy[i] = j;
                          return copy;
                        })
                      }
                    />
                    {o}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ol>
        {result && (
          <div className="mt-4 rounded-lg bg-secondary/60 p-4 text-sm">
            <p>
              Résultat : {result.score}/10 — niveau estimé <strong>{result.level}</strong>.
            </p>
            <button
              onClick={() => saveMutation.mutate({ english_self_level: result.level })}
              className="mt-2 rounded-md border border-border bg-card px-3 py-1.5"
            >
              Enregistrer ce niveau
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-primary/40 bg-primary/5 p-5">
        <h2 className="font-display text-lg font-semibold">Progresser vite : English Path</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Le séjour linguistique proposé avec KPB Education pour atteindre le score exigé avant ta
          date limite.
        </p>
        <a
          href={ENGLISH_PATH_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          En savoir plus sur WhatsApp
        </a>
      </section>
    </div>
  );
}
