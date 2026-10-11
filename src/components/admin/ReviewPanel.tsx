import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assignAgent, getReviewQueue, markItemReviewed } from "@/lib/admin/review.functions";
import { formatDateFr } from "@/lib/matching";
import { EngagementsPanel } from "./EngagementsPanel";

const KEY = ["admin-review"];
const STATUS: Record<string, string> = {
  active: "Actif",
  documents_review: "Revue des documents",
  submitted: "Dossier déposé",
};

/** Accompagnement : engagements par agent, éléments à relire, paiements des tranches. */
export function ReviewPanel() {
  const queryClient = useQueryClient();
  const fetchQueue = useServerFn(getReviewQueue);
  const mark = useServerFn(markItemReviewed);
  const assign = useServerFn(assignAgent);
  const { data } = useQuery({ queryKey: KEY, queryFn: () => fetchQueue(), retry: false });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });

  const markMutation = useMutation({
    mutationFn: (itemId: string) => mark({ data: { itemId, reviewed: true } }),
    onSuccess: () => {
      toast.success("Marqué « Revu par KPB »");
      refresh();
    },
    onError: () => toast.error("Action impossible"),
  });
  const assignMutation = useMutation({
    mutationFn: (v: { engagementId: string; agentId: string | null }) => assign({ data: v }),
    onSuccess: refresh,
    onError: () => toast.error("Action impossible"),
  });

  if (!data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const byAgent = new Map<string, typeof data.engagements>();
  for (const e of data.engagements) {
    const key = e.agentName ?? "Non attribué";
    byAgent.set(key, [...(byAgent.get(key) ?? []), e]);
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-display text-lg font-semibold">À relire ({data.items.length})</h3>
        <p className="text-xs text-muted-foreground">
          Éléments terminés par les membres accompagnés. « Revu par KPB » s'affiche sur leur
          checklist.
        </p>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card text-sm">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              <span>
                <span className="font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {item.applications?.bourses?.university_name ?? ""} · terminé le{" "}
                  {formatDateFr(item.completed_at)}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={markMutation.isPending}
                onClick={() => markMutation.mutate(item.id)}
              >
                <CheckCheck className="size-4" /> Revu par KPB
              </Button>
            </li>
          ))}
          {data.items.length === 0 && (
            <li className="p-3 text-muted-foreground">Rien à relire pour le moment.</li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-lg font-semibold">Engagements en cours, par agent</h3>
        <div className="mt-3 space-y-4">
          {[...byAgent.entries()].map(([agent, list]) => (
            <div key={agent}>
              <h4 className="text-sm font-medium">
                {agent} ({list.length})
              </h4>
              <ul className="mt-1 divide-y divide-border rounded-xl border border-border bg-card text-sm">
                {list.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <span>
                      <span className="font-medium">{e.profiles?.full_name || "Membre"}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {e.profiles?.member_code} · {e.university} · {STATUS[e.status] ?? e.status}
                        {e.deadline ? ` · ${formatDateFr(e.deadline)}` : ""}
                      </span>
                    </span>
                    <select
                      aria-label="Agent"
                      className="rounded-md border border-input bg-card px-2 py-1 text-xs"
                      value={e.assigned_agent ?? ""}
                      onChange={(ev) =>
                        assignMutation.mutate({
                          engagementId: e.id,
                          agentId: ev.target.value || null,
                        })
                      }
                    >
                      <option value="">Non attribué</option>
                      {data.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {data.engagements.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun accompagnement en cours.</p>
          )}
        </div>
      </section>

      <EngagementsPanel />
    </div>
  );
}
