import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { compact, optionalUuid } from "@/lib/search-params";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getPaymentStatus } from "@/lib/payments.functions";

const POLL_MS = 3_000;
const POLL_LIMIT_MS = 60_000;

export const Route = createFileRoute("/_authenticated/paiement/retour")({
  validateSearch: (search: Record<string, unknown>) =>
    compact({ payment: optionalUuid(search["payment"]) }),
  head: () => ({
    meta: [
      { title: "Confirmation du paiement — KPB Education" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentReturn,
});

function PaymentReturn() {
  const { payment } = Route.useSearch();
  const fetchStatus = useServerFn(getPaymentStatus);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const startedAt = useRef(Date.now());
  const [timedOut, setTimedOut] = useState(false);

  const { data } = useQuery({
    queryKey: ["payment-status", payment],
    enabled: Boolean(payment),
    // Le premier appel relit l'état chez Maketou, au cas où le webhook serait en retard
    queryFn: async () => {
      const first = Date.now() - startedAt.current < POLL_MS;
      return fetchStatus({ data: { paymentId: payment!, recheck: first } });
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "success" || status === "failed") return false;
      return Date.now() - startedAt.current > POLL_LIMIT_MS ? false : POLL_MS;
    },
  });

  const recheck = useMutation({
    mutationFn: () => fetchStatus({ data: { paymentId: payment!, recheck: true } }),
    onSuccess: (result) => queryClient.setQueryData(["payment-status", payment], result),
  });

  const status = recheck.data?.status ?? data?.status;

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status !== "success") return;
    void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
    const t = setTimeout(() => navigate({ to: "/dashboard" }), 2_500);
    return () => clearTimeout(t);
  }, [status, navigate, queryClient]);

  if (!payment) {
    return <p className="py-10 text-sm text-muted-foreground">Aucun paiement à vérifier.</p>;
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
      {status === "success" ? (
        <>
          <CheckCircle2 className="mx-auto size-8 text-primary" />
          <h1 className="mt-3 font-display text-2xl font-semibold">Paiement confirmé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {(recheck.data ?? data)?.kind === "engagement"
              ? "Votre accompagnement est enregistré : un agent KPB vous contacte sous 48 heures."
              : "Votre accès au Club Boursier est actif."}{" "}
            Redirection vers votre espace…
          </p>
        </>
      ) : status === "failed" ? (
        <>
          <XCircle className="mx-auto size-8 text-destructive" />
          <h1 className="mt-3 font-display text-2xl font-semibold">Paiement non abouti</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun montant n'a été validé. Vous pouvez réessayer.
          </p>
          <Link
            to="/offre"
            className="mt-4 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Réessayer
          </Link>
        </>
      ) : (
        <>
          <Clock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-3 font-display text-2xl font-semibold">Confirmation en cours</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {timedOut
              ? "La confirmation prend plus de temps que prévu. Si vous avez payé, votre accès s'activera automatiquement dans quelques minutes."
              : "Nous attendons la confirmation de votre opérateur mobile money…"}
          </p>
          {timedOut && (
            <button
              onClick={() => recheck.mutate()}
              disabled={recheck.isPending}
              className="mt-4 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {recheck.isPending ? "Vérification…" : "Vérifier à nouveau"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
