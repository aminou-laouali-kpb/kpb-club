import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/admin/dashboard.functions";
import { formatFcfa } from "@/lib/pricing";

const FEATURE_LABELS: Record<string, string> = {
  application_created: "Candidature créée",
  item_done: "Élément coché",
  doc_uploaded: "Document déposé",
  essay_reviewed: "Analyse d'essai",
  chapter_read: "Chapitre lu",
  whatsapp_command: "Bot WhatsApp",
  coach_used: "Coach (questions)",
};

const AI_LABELS: Record<string, string> = {
  essay_review: "Analyse d'essai",
  cv_review: "Revue de CV",
  interview_sim: "Entretien",
  coach_chat: "Questions-réponses",
  doc_classify: "Classement de documents",
};

function Tile(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{props.label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{props.value}</p>
      {props.hint && <p className="mt-0.5 text-xs text-muted-foreground">{props.hint}</p>}
    </div>
  );
}

/** Barre horizontale (une seule série, une seule teinte), valeur écrite à côté. */
function Bar(props: { label: string; value: number; max: number; text: string }) {
  const pct = props.max > 0 ? Math.max(1, (props.value / props.max) * 100) : 0;
  return (
    <div
      className="grid grid-cols-[9rem_1fr_5rem] items-center gap-3 text-sm"
      title={`${props.label} : ${props.text}`}
    >
      <span className="truncate text-muted-foreground">{props.label}</span>
      <div className="h-3 rounded-r bg-muted">
        <div className="h-3 rounded-r bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right tabular-nums">{props.text}</span>
    </div>
  );
}

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

export function DashboardPanel() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetchDashboard(),
    retry: false,
    staleTime: 60_000,
  });
  if (isPending)
    return <p className="py-6 text-sm text-muted-foreground">Calcul des indicateurs…</p>;
  if (isError || !data)
    return <p className="py-6 text-sm text-destructive">Indicateurs indisponibles.</p>;
  const k = data.kpis;
  const funnelMax = data.funnel[0]?.count ?? 0;
  const churnMax = Math.max(1, ...data.beforeChurn.usage.map((u) => u.count));
  const maxOffset = Math.max(0, ...data.cohorts.map((c) => c.retention.length));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Membres actifs"
          value={String(k.activeMembers)}
          hint={`${k.totalMembers} inscrits`}
        />
        <Tile label="Revenu mensuel récurrent" value={formatFcfa(k.mrr)} />
        <Tile
          label="Fins d'accès sous 7 jours"
          value={String(k.renewals7d)}
          hint="sans renouvellement"
        />
        <Tile
          label="Churn du mois"
          value={`${k.churn.rate} %`}
          hint={`${k.churn.churned} sur ${k.churn.activeAtStart} actifs au 1er`}
        />
        <Tile label="Alertes envoyées (30 j)" value={String(k.alerts_sent)} />
        <Tile
          label="IA (30 j)"
          value={`${Number(k.ai_cost_usd).toFixed(2)} $`}
          hint={`${k.ai_calls} appels`}
        />
        <Tile label="Chapitres lus (30 j)" value={String(k.chapters_read)} />
        <Tile
          label="Préparation moyenne"
          value={`${k.avg_readiness} %`}
          hint="candidatures en cours"
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-display text-lg font-semibold">
          Entonnoir gratuit → Club → accompagnement
        </h3>
        <div className="mt-4 space-y-2">
          {data.funnel.map((f) => (
            <Bar
              key={f.step}
              label={f.step}
              value={f.count}
              max={funnelMax}
              text={`${f.count} · ${f.rate} %`}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-display text-lg font-semibold">Rétention par cohorte mensuelle</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Part des inscrits du mois qui utilisent la plateforme les mois suivants.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-normal">Cohorte</th>
                <th className="py-1 text-right font-normal">Inscrits</th>
                {Array.from({ length: maxOffset }, (_, i) => (
                  <th key={i} className="py-1 text-center font-normal">
                    M{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr key={c.cohort}>
                  <td className="py-0.5 pr-2">{monthLabel(c.cohort)}</td>
                  <td className="py-0.5 pr-2 text-right tabular-nums">{c.size}</td>
                  {Array.from({ length: maxOffset }, (_, i) => {
                    const v = c.retention[i];
                    return (
                      <td key={i} className="p-0.5">
                        {v === undefined || v === null ? null : (
                          <div
                            className="relative rounded py-1 text-center tabular-nums"
                            title={`${monthLabel(c.cohort)}, mois ${i} : ${v} %`}
                          >
                            <div
                              className="absolute inset-0 rounded bg-primary"
                              style={{ opacity: 0.08 + (v / 100) * 0.72 }}
                            />
                            <span className={`relative ${v > 55 ? "text-primary-foreground" : ""}`}>
                              {v} %
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg font-semibold">Avant un départ</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Fonctionnalités utilisées la semaine précédant la fin d'accès ({data.beforeChurn.churns}{" "}
            départs sur 6 mois).
          </p>
          <div className="mt-4 space-y-2">
            {data.beforeChurn.usage.map((u) => (
              <Bar
                key={u.feature}
                label={FEATURE_LABELS[u.feature] ?? u.feature}
                value={u.count}
                max={churnMax}
                text={String(u.count)}
              />
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-lg font-semibold">Coût IA par fonction (30 j)</h3>
          <ul className="mt-4 divide-y divide-border text-sm">
            {Object.entries(k.ai_by_feature).map(([feature, v]) => (
              <li key={feature} className="flex justify-between py-2">
                <span>{AI_LABELS[feature] ?? feature}</span>
                <span className="tabular-nums text-muted-foreground">
                  {v.calls} appels · {Number(v.cost).toFixed(2)} $
                </span>
              </li>
            ))}
            {Object.keys(k.ai_by_feature).length === 0 && (
              <li className="py-2 text-muted-foreground">Aucun appel sur la période.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
