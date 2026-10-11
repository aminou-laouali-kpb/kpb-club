import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  getAdminData,
  activatePayment,
  rejectPayment,
  grantSubscription,
  recheckPayment,
  setAmbassador,
} from "@/lib/admin.functions";
import { AccessCodesPanel } from "@/components/admin/AccessCodesPanel";
import { formatFcfa, PROVIDERS } from "@/lib/pricing";
import { formatDateFr } from "@/lib/matching";

function providerLabel(id: string) {
  if (id === "maketou") return "Maketou";
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/** Paiements, abonnements, codes d'accès, membres inscrits et messages automatiques. */
export function PaymentsPanel() {
  const fetchAdmin = useServerFn(getAdminData);
  const activate = useServerFn(activatePayment);
  const reject = useServerFn(rejectPayment);
  const grant = useServerFn(grantSubscription);
  const recheck = useServerFn(recheckPayment);
  const ambassador = useServerFn(setAmbassador);
  const ambassadorMutation = useMutation({
    mutationFn: (vars: { profileId: string; value: boolean }) => ambassador({ data: vars }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-data"] }),
    onError: () => toast.error("Action impossible"),
  });
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-data"],
    queryFn: () => fetchAdmin(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-data"] });

  const activateMutation = useMutation({
    mutationFn: (paymentId: string) => activate({ data: { paymentId } }),
    onSuccess: () => {
      toast.success("Abonnement activé");
      void refresh();
    },
    onError: () => toast.error("Activation impossible"),
  });

  const rejectMutation = useMutation({
    mutationFn: (paymentId: string) => reject({ data: { paymentId } }),
    onSuccess: () => {
      toast.success("Demande refusée");
      void refresh();
    },
    onError: () => toast.error("Action impossible"),
  });

  const recheckMutation = useMutation({
    mutationFn: (paymentId: string) => recheck({ data: { paymentId } }),
    onSuccess: (result) => {
      const labels: Record<string, string> = {
        success: "Paiement confirmé par Maketou",
        failed: "Paiement non abouti chez Maketou",
        pending: "Toujours en attente chez Maketou",
        not_found: "Paiement introuvable",
      };
      toast.info(labels[result.status] ?? result.status);
      void refresh();
    },
    onError: () => toast.error("Vérification impossible"),
  });

  const grantMutation = useMutation({
    mutationFn: (vars: { profileId: string; plan: "monthly" | "quarterly" }) =>
      grant({ data: vars }),
    onSuccess: () => {
      toast.success("Accès accordé");
      void refresh();
    },
    onError: () => toast.error("Action impossible"),
  });

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (isError || !data)
    return (
      <p className="py-10 text-sm text-muted-foreground">Cette page est réservée à l'équipe KPB.</p>
    );

  const pending = data.payments.filter((p) => p.status === "pending");
  const activeSubs = data.subscriptions.filter((s) => new Date(s.ends_at).getTime() > Date.now());

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-muted-foreground">
          {data.profiles.length} inscrits · {activeSubs.length} abonnements en cours ·{" "}
          {pending.length} paiement(s) à confirmer
        </p>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold">Paiements à confirmer</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucune demande en attente.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((p) => {
              const profile = p.profiles as unknown as {
                full_name: string | null;
                email: string | null;
                phone: string | null;
                member_code: string | null;
              } | null;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {profile?.full_name || "Sans nom"}{" "}
                      <span className="text-muted-foreground">({profile?.member_code})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatFcfa(p.amount)} · {providerLabel(p.provider)} ·{" "}
                      {formatDateFr(p.created_at)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {profile?.email} {profile?.phone ? `· ${profile.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.provider === "maketou" && (
                      <button
                        onClick={() => recheckMutation.mutate(p.id)}
                        disabled={recheckMutation.isPending}
                        className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60"
                      >
                        Vérifier chez Maketou
                      </button>
                    )}
                    <button
                      onClick={() => activateMutation.mutate(p.id)}
                      disabled={activateMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                      <Check className="size-4" /> Activer
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(p.id)}
                      disabled={rejectMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60"
                    >
                      <X className="size-4" /> Refuser
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Abonnements en cours</h2>
        {activeSubs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun abonnement actif.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {activeSubs.map((s) => {
              const profile = s.profiles as unknown as {
                full_name: string | null;
                member_code: string | null;
              } | null;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span>
                    {profile?.full_name || "Sans nom"}{" "}
                    <span className="text-muted-foreground">({profile?.member_code})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {s.source === "promo"
                      ? "Code d'accès"
                      : s.source === "grant"
                        ? "Offert"
                        : s.plan === "quarterly"
                          ? "Trimestriel"
                          : "Mensuel"}{" "}
                    · jusqu'au {formatDateFr(s.ends_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AccessCodesPanel />

      <section>
        <h2 className="font-display text-xl font-semibold">Membres inscrits</h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {data.profiles.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="font-medium">
                  {m.full_name || "Sans nom"}{" "}
                  <span className="text-muted-foreground">({m.member_code})</span>
                </p>
                <p className="text-muted-foreground">
                  {m.email} · inscrit le {formatDateFr(m.created_at)} · crédit{" "}
                  {formatFcfa(m.credit_balance ?? 0)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    ambassadorMutation.mutate({ profileId: m.id, value: !m.is_ambassador })
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    m.is_ambassador ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {m.is_ambassador ? "Ambassadeur ✓" : "Ambassadeur"}
                </button>
                <button
                  onClick={() => grantMutation.mutate({ profileId: m.id, plan: "monthly" })}
                  className="rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  +1 mois
                </button>
                <button
                  onClick={() => grantMutation.mutate({ profileId: m.id, plan: "quarterly" })}
                  className="rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  +3 mois
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Derniers messages automatiques</h2>
        {data.notifications.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun message pour l'instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {data.notifications.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="flex-1">
                  {n.subject}
                  <span className="block text-muted-foreground">{n.recipient}</span>
                </span>
                <span className="text-muted-foreground">
                  {n.status === "sent" ? "envoyé" : n.status === "failed" ? "échec" : "en attente"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
