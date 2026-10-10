import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { getAiOverview } from "@/lib/ai.functions";

const ROWS = [
  { feature: "essay_review", label: "Analyses d'essai", tab: "essay" },
  { feature: "cv_review", label: "Revues de CV", tab: "cv" },
  { feature: "interview_sim", label: "Entretiens", tab: "interview" },
  { feature: "coach_chat", label: "Questions", tab: "chat" },
] as const;

/** Quotas IA restants ce mois-ci, avec un accès direct à chaque fonction du coach. */
export function AiQuotaCard() {
  const fetchOverview = useServerFn(getAiOverview);
  const { data } = useQuery({ queryKey: ["ai-overview"], queryFn: () => fetchOverview() });
  if (!data) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="size-5 text-primary" /> Ton coach
        </h2>
        <Link to="/coach" className="text-sm font-medium text-primary">
          Ouvrir
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ROWS.map((row) => {
          const q = data.quotas[row.feature];
          return (
            <Link
              key={row.feature}
              to="/coach"
              search={{ tab: row.tab }}
              className="rounded-lg bg-secondary/60 p-3 text-sm hover:bg-secondary"
            >
              <span className="block text-muted-foreground">{row.label}</span>
              <span className="font-display text-xl font-semibold">
                {q ? (q.limit === 0 ? "Club" : `${q.remaining}/${q.limit}`) : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
