import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { compact, optionalUuid } from "@/lib/search-params";
import { CheckCircle2 } from "lucide-react";
import {
  listEngagements,
  payNextInstallment,
  startEngagementCheckout,
} from "@/lib/engagements.functions";
import { PRICING, engagementPlan, formatFcfa, type PackageType } from "@/lib/pricing";
import { formatDateFr } from "@/lib/matching";
import { ACCOMPANIMENT_CONTACT_URL } from "@/lib/contact";

export const Route = createFileRoute("/_authenticated/accompagnement")({
  validateSearch: (search: Record<string, unknown>) =>
    compact({ application: optionalUuid(search["application"]) }),
  head: () => ({
    meta: [
      { title: "Accompagnement — KPB Education" },
      {
        name: "description",
        content: "Un agent KPB prépare ta candidature avec toi. Paiement possible en deux fois.",
      },
    ],
  }),
  component: Accompagnement,
});

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "En attente de paiement",
  active: "En cours",
  documents_review: "Revue des documents",
  submitted: "Dossier déposé",
  completed: "Terminé",
};

function Accompagnement() {
  const { application } = Route.useSearch();
  const fetchData = useServerFn(listEngagements);
  const start = useServerFn(startEngagementCheckout);
  const payNext = useServerFn(payNextInstallment);
  const [pkg, setPkg] = useState<PackageType>("single");
  const [installments, setInstallments] = useState<1 | 2>(2);

  const { data, isPending } = useQuery({ queryKey: ["engagements"], queryFn: () => fetchData() });

  const redirect = ({ checkoutUrl }: { checkoutUrl: string }) =>
    window.location.assign(checkoutUrl);
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Impossible de lancer le paiement.");

  const startMutation = useMutation({
    mutationFn: () =>
      start({ data: { package: pkg, installments, applicationId: application ?? null } }),
    onSuccess: redirect,
    onError,
  });
  const nextMutation = useMutation({
    mutationFn: (engagementId: string) => payNext({ data: { engagementId } }),
    onSuccess: redirect,
    onError,
  });

  if (isPending || !data) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;

  const plan = engagementPlan(pkg, installments, data.creditBalance);
  const busy = startMutation.isPending || startMutation.isSuccess;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">Accompagnement KPB</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Un agent KPB prépare ta candidature avec toi : stratégie, relecture des essais et du CV,
          vérification des pièces et préparation à l'entretien.
        </p>
      </div>

      {data.engagements.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold">Mes accompagnements</h2>
          <ul className="mt-3 space-y-3">
            {data.engagements.map((e) => {
              const remaining = Math.max(0, e.amount - e.paid_amount);
              const label =
                PRICING.accompaniment[(e.package_type ?? "single") as PackageType]?.label ?? "";
              return (
                <li key={e.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {label}
                      {e.university ? ` · ${e.university}` : ""}
                    </p>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                      {STATUS_LABELS[e.status] ?? e.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Réglé : {formatFcfa(e.paid_amount)} sur {formatFcfa(e.amount)}
                  </p>
                  {remaining > 0 && e.installments === 2 && e.status !== "pending_payment" && (
                    <div className="mt-3 rounded-lg border border-accent/50 bg-accent/10 p-3 text-sm">
                      <p>
                        2e tranche : <strong>{formatFcfa(remaining)}</strong>
                        {e.second_due_at ? ` avant le ${formatDateFr(e.second_due_at)}` : ""}. Le
                        dépôt final de ton dossier attend ce règlement.
                      </p>
                      <button
                        onClick={() => nextMutation.mutate(e.id)}
                        disabled={nextMutation.isPending}
                        className="mt-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
                      >
                        Payer la 2e tranche
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold">Choisir une formule</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(Object.keys(PRICING.accompaniment) as PackageType[]).map((key) => {
            const offer = PRICING.accompaniment[key];
            return (
              <button
                key={key}
                onClick={() => setPkg(key)}
                className={`rounded-xl border p-5 text-left transition-colors ${
                  pkg === key ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <p className="text-sm text-muted-foreground">{offer.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold">
                  {formatFcfa(offer.amount)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{offer.description}</p>
              </button>
            );
          })}
        </div>

        <h3 className="mt-6 font-medium">Paiement</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {([2, 1] as const).map((n) => (
            <button
              key={n}
              onClick={() => setInstallments(n)}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${
                installments === n
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border bg-card"
              }`}
            >
              {n === 2 ? "En 2 fois (aujourd'hui puis à 30 jours)" : "En une fois"}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex justify-between">
            <span>{installments === 2 ? "1re tranche" : "Montant"}</span>
            <span>{formatFcfa(plan.firstGross)}</span>
          </p>
          {plan.credit > 0 && (
            <p className="flex justify-between text-primary">
              <span>Crédit Club déduit</span>
              <span>− {formatFcfa(plan.credit)}</span>
            </p>
          )}
          <p className="flex justify-between border-t border-border pt-2 font-medium">
            <span>À payer aujourd'hui</span>
            <span>{formatFcfa(plan.first)}</span>
          </p>
          {installments === 2 && (
            <p className="flex justify-between text-muted-foreground">
              <span>2e tranche dans 30 jours</span>
              <span>{formatFcfa(plan.second)}</span>
            </p>
          )}
        </div>

        <button
          onClick={() => startMutation.mutate()}
          disabled={busy}
          className="mt-6 w-full rounded-md bg-primary px-5 py-3.5 font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Redirection vers le paiement…" : `Payer ${formatFcfa(plan.first)}`}
        </button>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          Un agent KPB te contacte sous 48 heures après le paiement.{" "}
          <a
            href={ACCOMPANIMENT_CONTACT_URL}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Une question avant de choisir ?
          </a>
        </p>
      </section>
    </div>
  );
}
