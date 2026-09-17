import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { requestSubscription } from "@/lib/member.functions";
import { PRICING, PROVIDERS, creditForPlan, formatFcfa, type ClubPlan, type ProviderId } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/offre")({
  head: () => ({
    meta: [
      { title: "Abonnement Club Boursier — KPB Education" },
      {
        name: "description",
        content: "Choisissez votre formule mensuelle ou trimestrielle du Club Boursier.",
      },
      { property: "og:title", content: "Abonnement Club Boursier — KPB Education" },
      { property: "og:description", content: "Formules mensuelle et trimestrielle du Club." },
    ],
  }),
  component: Offre,
});

function Offre() {
  const [plan, setPlan] = useState<ClubPlan>("quarterly");
  const [provider, setProvider] = useState<ProviderId>("wave");
  const [done, setDone] = useState(false);
  const request = useServerFn(requestSubscription);

  const mutation = useMutation({
    mutationFn: () => request({ data: { plan, provider } }),
    onSuccess: () => setDone(true),
    onError: () => toast.error("Impossible d'enregistrer votre demande. Réessayez."),
  });

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto size-7 text-primary" />
        <h1 className="mt-3 font-display text-2xl font-semibold">Demande enregistrée</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Montant à régler : <strong>{formatFcfa(PRICING.club[plan].amount)}</strong> via{" "}
          {PROVIDERS.find((p) => p.id === provider)?.label}. L'équipe KPB confirme votre paiement et
          active votre accès sous 24 heures.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Abonnement Club Boursier</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choisissez votre formule, puis le moyen de paiement mobile.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(Object.keys(PRICING.club) as ClubPlan[]).map((key) => (
          <button
            key={key}
            onClick={() => setPlan(key)}
            className={`rounded-xl border p-5 text-left transition-colors ${
              plan === key ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <p className="text-sm text-muted-foreground">{PRICING.club[key].label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              {formatFcfa(PRICING.club[key].amount)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {PRICING.club[key].duration_days} jours · crédit {formatFcfa(creditForPlan(key))}
            </p>
          </button>
        ))}
      </div>

      <h2 className="mt-8 font-display text-xl font-semibold">Moyen de paiement</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProvider(p.id)}
            className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
              provider === p.id ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="mt-8 w-full rounded-md bg-primary px-5 py-3.5 font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
      >
        {mutation.isPending ? "Un instant…" : `Payer ${formatFcfa(PRICING.club[plan].amount)}`}
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        Le paiement en ligne automatique arrive bientôt. Pour l'instant votre demande est
        enregistrée et l'équipe active votre accès après réception.
      </p>
    </div>
  );
}
