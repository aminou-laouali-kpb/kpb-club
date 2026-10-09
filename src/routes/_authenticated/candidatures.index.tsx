import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { createApplication, listApplications } from "@/lib/applications.functions";
import { listBourses } from "@/lib/bourses.functions";
import { useMemberOverview } from "@/hooks/useMemberOverview";
import { ApplicationCard } from "@/components/application/ApplicationCard";
import { countryName } from "@/lib/countries";
import { formatDateFr } from "@/lib/matching";

export const Route = createFileRoute("/_authenticated/candidatures/")({
  head: () => ({
    meta: [
      { title: "Mes candidatures — KPB Education" },
      { name: "description", content: "Suivez la préparation de chacune de vos candidatures." },
    ],
  }),
  component: Candidatures,
});

function Candidatures() {
  const fetchList = useServerFn(listApplications);
  const fetchBourses = useServerFn(listBourses);
  const create = useServerFn(createApplication);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: overview } = useMemberOverview();
  const [query, setQuery] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["applications"],
    queryFn: () => fetchList(),
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["bourses-catalog"],
    queryFn: () => fetchBourses(),
  });

  const createMutation = useMutation({
    mutationFn: (bourseId: string) => create({ data: { bourseId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
      navigate({ to: "/candidatures/$id", params: { id: result.id } });
    },
    onError: () => toast.error("Impossible d'ajouter cette bourse. Réessayez."),
  });

  const followed = useMemo(
    () => new Set((data?.applications ?? []).map((a) => a.bourse_id)),
    [data],
  );
  const matchIds = new Set((overview?.matches ?? []).map((m) => m.id));
  const available = catalog
    .filter((b) => !followed.has(b.id))
    .filter(
      (b) =>
        !query ||
        `${b.university_name} ${countryName(b.country)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(matchIds.has(b.id)) - Number(matchIds.has(a.id)));

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  const applications = data?.applications ?? [];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">Mes candidatures</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pour chaque bourse : ce qu'il te reste à préparer, et dans quel ordre.
        </p>
      </div>

      {applications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Tu ne suis encore aucune bourse. Choisis-en une ci-dessous pour obtenir ta checklist.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {applications.map((app) => (
            <ApplicationCard key={app.id} app={app} />
          ))}
        </div>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold">Ajouter une bourse</h2>
        {!data?.canAdd && (
          <div className="mt-3 rounded-xl border border-accent/50 bg-accent/10 p-4 text-sm">
            Le compte gratuit permet de suivre une candidature.{" "}
            <Link
              to="/offre"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Rejoindre le Club
            </Link>{" "}
            pour en suivre autant que tu veux.
          </div>
        )}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une université ou un pays"
            className="w-full rounded-md border border-input bg-card py-2.5 pl-9 pr-3 text-base"
          />
        </div>
        {available.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucune autre bourse disponible.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {available.map((b) => (
              <li key={b.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.university_name}
                    {matchIds.has(b.id) && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        Compatible
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {countryName(b.country)} · date limite {formatDateFr(b.window_closes)}
                  </p>
                </div>
                <button
                  onClick={() => createMutation.mutate(b.id)}
                  disabled={createMutation.isPending || !data?.canAdd}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  <Plus className="size-4" /> Suivre
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
