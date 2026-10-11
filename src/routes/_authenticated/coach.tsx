import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { compact, optionalEnum } from "@/lib/search-params";
import { FileText, MessageCircleQuestion, Mic, PenLine } from "lucide-react";
import { getAiOverview, listCoachInputs, reviewCv, reviewEssay } from "@/lib/ai.functions";
import { FEATURE_LABELS } from "@/lib/ai/quotas";
import type { CvReview, EssayReview } from "@/lib/ai/schemas";
import { formatDateFr } from "@/lib/matching";
import { CvReviewResult, EssayReviewResult } from "@/components/coach/ReviewResults";
import { InterviewSimulator } from "@/components/coach/InterviewSimulator";
import { CoachChat } from "@/components/coach/CoachChat";

const TABS = [
  { id: "essay", label: "Essai", icon: PenLine, feature: "essay_review" },
  { id: "cv", label: "CV", icon: FileText, feature: "cv_review" },
  { id: "interview", label: "Entretien", icon: Mic, feature: "interview_sim" },
  { id: "chat", label: "Questions", icon: MessageCircleQuestion, feature: "coach_chat" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/coach")({
  validateSearch: (search: Record<string, unknown>) =>
    compact({ tab: optionalEnum(search["tab"], ["essay", "cv", "interview", "chat"] as const) }),
  head: () => ({
    meta: [
      { title: "Coach — KPB Education" },
      {
        name: "description",
        content:
          "Analyse d'essai, revue de CV, simulateur d'entretien et réponses à tes questions.",
      },
    ],
  }),
  component: Coach,
});

function Coach() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "essay");
  const fetchOverview = useServerFn(getAiOverview);
  const fetchInputs = useServerFn(listCoachInputs);
  const { data: overview } = useQuery({
    queryKey: ["ai-overview"],
    queryFn: () => fetchOverview(),
  });
  const { data: inputs } = useQuery({ queryKey: ["coach-inputs"], queryFn: () => fetchInputs() });

  const active = TABS.find((t) => t.id === tab)!;
  const quota = overview?.quotas[active.feature];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Coach</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le coach évalue, questionne et signale ce qui manque. Il n'écrit jamais à ta place : c'est
          ta voix que les jurys veulent lire.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary/60 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium sm:flex-row sm:justify-center sm:text-sm ${
              tab === t.id ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {quota && (
        <p className="text-sm text-muted-foreground">
          {quota.limit === 0 ? (
            <>
              {FEATURE_LABELS[active.feature]} : réservé aux membres du Club.{" "}
              <Link
                to="/offre"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Rejoindre le Club
              </Link>
            </>
          ) : (
            <>
              <strong className="text-foreground">{quota.remaining}</strong> /{quota.limit}{" "}
              {FEATURE_LABELS[active.feature].toLowerCase()} restant
              {quota.remaining > 1 ? "es" : "e"}
              {quota.lifetime ? " (offerte)" : " ce mois-ci"}.
            </>
          )}
        </p>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        {tab === "essay" && <EssayPanel essays={inputs?.essays ?? []} />}
        {tab === "cv" && (
          <CvPanel cvs={inputs?.cvs ?? []} applications={inputs?.applications ?? []} />
        )}
        {tab === "interview" && <InterviewSimulator applications={inputs?.applications ?? []} />}
        {tab === "chat" && <CoachChat />}
      </section>

      {overview && overview.history.length > 0 && (tab === "essay" || tab === "cv") && (
        <section>
          <h2 className="font-display text-lg font-semibold">Mes analyses</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {overview.history
              .filter((h) => h.feature === active.feature)
              .map((h) => {
                const r = h.result as { overall_score?: number; verdict?: string } | null;
                return (
                  <li key={h.id} className="flex items-center gap-3 p-3">
                    <span className="w-12 font-display text-lg font-semibold">
                      {r?.overall_score ?? "—"}
                    </span>
                    <span className="flex-1 text-muted-foreground">{r?.verdict}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateFr(h.created_at)}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
    </div>
  );
}

function useReviewMutation<T>(
  fn: () => Promise<{ ok: true; review?: T; refusal?: string } | { ok: false; error: string }>,
) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<T | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRefusal(res.refusal ?? null);
      setResult(res.review ?? null);
      void queryClient.invalidateQueries({ queryKey: ["ai-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["coach-inputs"] });
    },
    onError: () => toast.error("Le coach est momentanément indisponible."),
  });
  return { mutation, result, refusal };
}

function EssayPanel({
  essays,
}: {
  essays: { itemId: string; label: string; bourseName: string; words: number }[];
}) {
  const review = useServerFn(reviewEssay);
  const [source, setSource] = useState<string>(essays[0]?.itemId ?? "paste");
  const [text, setText] = useState("");
  const { mutation, result, refusal } = useReviewMutation<EssayReview>(
    () =>
      review({
        data: source === "paste" ? { text } : { itemId: source },
      }) as never,
  );

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">
        Essai à analyser
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
        >
          {essays.map((e) => (
            <option key={e.itemId} value={e.itemId}>
              {e.bourseName} — {e.label} ({e.words} mots)
            </option>
          ))}
          <option value="paste">Coller un texte</option>
        </select>
      </label>
      {source === "paste" && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          maxLength={20_000}
          placeholder="Colle ton essai ici (80 mots minimum)."
          className="w-full rounded-md border border-input bg-background p-3 text-base"
        />
      )}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || (source === "paste" && !text.trim())}
        className="rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
      >
        {mutation.isPending ? "Analyse en cours… (jusqu'à une minute)" : "Analyser mon essai"}
      </button>
      {refusal && <p className="rounded-lg bg-secondary/60 p-3 text-sm">{refusal}</p>}
      {result && <EssayReviewResult review={result} />}
    </div>
  );
}

function CvPanel({
  cvs,
  applications,
}: {
  cvs: { id: string; label: string }[];
  applications: { bourseId: string; bourseName: string }[];
}) {
  const review = useServerFn(reviewCv);
  const [source, setSource] = useState<string>(cvs[0]?.id ?? "paste");
  const [bourseId, setBourseId] = useState<string>(applications[0]?.bourseId ?? "");
  const [text, setText] = useState("");
  const { mutation, result, refusal } = useReviewMutation<CvReview>(
    () =>
      review({
        data: {
          ...(source === "paste" ? { text } : { documentId: source }),
          bourseId: bourseId || null,
        },
      }) as never,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          CV
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
          >
            {cvs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} (coffre-fort)
              </option>
            ))}
            <option value="paste">Coller le texte du CV</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Bourse visée
          <select
            value={bourseId}
            onChange={(e) => setBourseId(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-base"
          >
            {applications.map((a) => (
              <option key={a.bourseId} value={a.bourseId}>
                {a.bourseName}
              </option>
            ))}
            <option value="">Aucune en particulier</option>
          </select>
        </label>
      </div>
      {source === "paste" && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          maxLength={20_000}
          placeholder="Colle le contenu de ton CV."
          className="w-full rounded-md border border-input bg-background p-3 text-base"
        />
      )}
      {cvs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Astuce : ajoute ton CV en PDF dans{" "}
          <Link to="/documents" className="text-primary underline-offset-4 hover:underline">
            tes documents
          </Link>{" "}
          pour l'analyser tel que le jury le verra.
        </p>
      )}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || (source === "paste" && !text.trim())}
        className="rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
      >
        {mutation.isPending ? "Analyse en cours…" : "Analyser mon CV"}
      </button>
      {refusal && <p className="rounded-lg bg-secondary/60 p-3 text-sm">{refusal}</p>}
      {result && <CvReviewResult review={result} />}
    </div>
  );
}
