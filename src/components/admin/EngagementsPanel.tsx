import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAdminEngagements, setEngagementStatus } from "@/lib/admin.functions";
import { PRICING, formatFcfa, type PackageType } from "@/lib/pricing";
import { formatDateFr } from "@/lib/matching";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "En attente de paiement",
  active: "Actif",
  documents_review: "Revue des documents",
  submitted: "Dossier déposé",
  completed: "Terminé",
  cancelled: "Annulé",
};

type Member = { full_name: string | null; member_code: string | null; phone?: string | null };

export function EngagementsPanel() {
  const fetchData = useServerFn(listAdminEngagements);
  const setStatus = useServerFn(setEngagementStatus);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-engagements"],
    queryFn: () => fetchData(),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: keyof typeof STATUS_LABELS }) =>
      setStatus({ data: vars as never }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.error);
      else toast.success("Statut mis à jour");
      void queryClient.invalidateQueries({ queryKey: ["admin-engagements"] });
    },
    onError: () => toast.error("Action impossible"),
  });

  if (!data) return null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Accompagnements</h2>
        {data.engagements.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun accompagnement en cours.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {data.engagements.map((e) => {
              const member = e.profiles as unknown as Member | null;
              const remaining = Math.max(0, e.amount - e.paid_amount);
              const pkg = PRICING.accompaniment[(e.package_type ?? "single") as PackageType];
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {member?.full_name || "Sans nom"}{" "}
                      <span className="text-muted-foreground">({member?.member_code})</span>
                    </p>
                    <p className="text-muted-foreground">
                      {pkg?.label ?? e.package_type}
                      {e.university ? ` · ${e.university}` : ""} · payé {formatFcfa(e.paid_amount)}{" "}
                      / {formatFcfa(e.amount)}
                      {e.credit_applied > 0 ? ` (dont crédit ${formatFcfa(e.credit_applied)})` : ""}
                    </p>
                    {remaining > 0 && e.installments === 2 && e.status !== "pending_payment" && (
                      <p className="text-destructive">
                        2e tranche : {formatFcfa(remaining)}
                        {e.second_due_at ? ` avant le ${formatDateFr(e.second_due_at)}` : ""}
                      </p>
                    )}
                  </div>
                  <select
                    value={e.status}
                    onChange={(ev) =>
                      mutation.mutate({
                        id: e.id,
                        status: ev.target.value as keyof typeof STATUS_LABELS,
                      })
                    }
                    className="rounded-md border border-input bg-background px-2 py-1.5"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data.overpaid.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-semibold">Crédits à rembourser</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Maketou a encaissé le prix plein alors qu'un crédit Club aurait dû être déduit.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-accent/50 bg-accent/5">
            {data.overpaid.map((p) => {
              const member = p.profiles as unknown as Member | null;
              const overpaid = Number((p.metadata as { overpaid?: number } | null)?.overpaid ?? 0);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span>
                    {member?.full_name || "Sans nom"}{" "}
                    <span className="text-muted-foreground">({member?.member_code})</span>
                  </span>
                  <span className="font-medium">
                    {formatFcfa(overpaid)} · {formatDateFr(p.paid_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
