import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { startCheckout } from "@/lib/payments.functions";
import { PRICING, PROVIDERS, creditForPlan, formatFcfa, type ClubPlan } from "@/lib/pricing";
import { AccessCodeForm } from "@/components/AccessCodeForm";

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
  const checkout = useServerFn(startCheckout);

  const mutation = useMutation({
    mutationFn: () => checkout({ data: { plan } }),
    onSuccess: ({ checkoutUrl }) => {
      window.location.assign(checkoutUrl);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Impossible de lancer le paiement. Réessayez."),
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Abonnement Club Boursier</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choisissez votre formule, puis réglez par mobile money sur la page de paiement sécurisée.
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

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || mutation.isSuccess}
        className="mt-8 w-full rounded-md bg-primary px-5 py-3.5 font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
      >
        {mutation.isPending || mutation.isSuccess
          ? "Redirection vers le paiement…"
          : `Payer ${formatFcfa(PRICING.club[plan].amount)}`}
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        Moyens acceptés : {PROVIDERS.map((p) => p.label).join(", ")}. Votre accès s'active
        automatiquement dès la confirmation du paiement.
      </p>

      <div className="mt-10 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Vous avez un code d'accès ?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Saisissez le code de 16 caractères remis par KPB Education.
        </p>
        <AccessCodeForm className="mt-3" />
      </div>
    </div>
  );
}
