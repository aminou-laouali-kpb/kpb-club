import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, BookOpen, FileText, Gift, Plus } from "lucide-react";
import { createApplication } from "@/lib/applications.functions";
import { ApplicationCard } from "@/components/application/ApplicationCard";
import { isActiveStatus, type ApplicationStatus } from "@/lib/applications";
import { useMemberOverview, hasAccess } from "@/hooks/useMemberOverview";
import { formatDateFr } from "@/lib/matching";
import { formatFcfa } from "@/lib/pricing";
import { AccessCodeForm } from "@/components/AccessCodeForm";
import { AiQuotaCard } from "@/components/coach/AiQuotaCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Mon espace — KPB Education" },
      {
        name: "description",
        content: "Vos bourses compatibles et votre abonnement Club Boursier.",
      },
      { property: "og:title", content: "Mon espace — KPB Education" },
      {
        property: "og:description",
        content: "Suivez vos bourses compatibles et votre abonnement.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isPending, isError } = useMemberOverview();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createApplication);

  const mustOnboard = Boolean(data && !data.onboardingCompleted && data.applications.length === 0);
  useEffect(() => {
    if (mustOnboard) navigate({ to: "/bienvenue", replace: true });
  }, [mustOnboard, navigate]);

  const followMutation = useMutation({
    mutationFn: (bourseId: string) => create({ data: { bourseId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["member-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      navigate({ to: "/candidatures/$id", params: { id: result.id } });
    },
    onError: () => toast.error("Impossible de suivre cette bourse. Réessayez."),
  });

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (isError || !data)
    return (
      <p className="py-10 text-sm text-muted-foreground">Impossible de charger votre espace.</p>
    );

  if (mustOnboard) return null;

  const { profile, subscriptionState, daysLeft, matches, applications } = data;
  const access = hasAccess(subscriptionState);
  const active = applications.filter((a) => isActiveStatus(a.status as ApplicationStatus));
  const followed = new Set(applications.map((a) => a.bourse_id));
  // Prochaine action globale : celle de la candidature dont l'échéance est la plus proche
  const urgent = active.find((a) => a.next_action);
  const urgentBourse = urgent?.bourses as { university_name: string } | null | undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          Bonjour {profile.full_name?.split(" ")[0] ?? ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Membre {profile.member_code ?? "—"} · crédit accompagnement{" "}
          {formatFcfa(profile.credit_balance ?? 0)}
        </p>
      </div>

      {urgent && (
        <Link
          to="/candidatures/$id"
          params={{ id: urgent.id }}
          className="block rounded-xl border border-primary/40 bg-primary/5 p-5 transition-colors hover:bg-primary/10"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            Ta prochaine action
          </p>
          <p className="mt-1 font-display text-xl font-semibold">{urgent.next_action}</p>
          <p className="mt-1 text-sm text-muted-foreground">{urgentBourse?.university_name}</p>
        </Link>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Mes candidatures</h2>
          <Link to="/candidatures" className="text-sm font-medium text-primary">
            Tout voir
          </Link>
        </div>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucune candidature en cours.{" "}
            <Link to="/candidatures" className="text-primary underline-offset-4 hover:underline">
              Choisir une bourse
            </Link>
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {active.slice(0, 4).map((app) => (
              <ApplicationCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </section>

      <div
        className={`rounded-xl border p-5 ${access ? "border-border bg-card" : "border-accent/50 bg-accent/10"}`}
      >
        {subscriptionState === "active" && (
          <p className="text-sm">
            Abonnement actif — <strong>{daysLeft} jour(s)</strong> restants.
          </p>
        )}
        {subscriptionState === "grace" && (
          <p className="text-sm">
            Période de grâce — il vous reste <strong>{daysLeft} jour(s)</strong> pour renouveler.
          </p>
        )}
        {subscriptionState === "none" && (
          <>
            <h2 className="font-display text-lg font-semibold">Activez le Club Boursier</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Le guide, les modèles et vos alertes de fenêtres sont réservés aux membres.
            </p>
          </>
        )}
        <Link
          to="/offre"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          {access ? "Renouveler" : "Voir les tarifs"} <ArrowRight className="size-4" />
        </Link>
        {!access && <AccessCodeForm className="mt-4" />}
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold">Vos bourses compatibles</h2>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucune fenêtre ouverte pour votre profil aujourd'hui. Pensez à compléter votre profil
            dans l'onglet Compte.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {matches.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-semibold">{b.university_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Date limite : {formatDateFr(b.window_closes)}
                  </p>
                </div>
                {!followed.has(b.id) && (
                  <button
                    onClick={() => followMutation.mutate(b.id)}
                    disabled={followMutation.isPending}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <Plus className="size-4" /> Suivre
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <AiQuotaCard />

      <Link
        to="/parrainage"
        className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
      >
        <Gift className="size-5 text-primary" />
        <span className="flex-1">
          <span className="block font-medium">Invite tes amis, gagne des mois offerts</span>
          <span className="block text-sm text-muted-foreground">
            30 jours de Club pour toi tous les 2 amis qui rejoignent le Club.
          </span>
        </span>
      </Link>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/guide"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
        >
          <BookOpen className="size-5 text-primary" />
          <span className="font-medium">Le guide de candidature</span>
        </Link>
        <Link
          to="/templates"
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
        >
          <FileText className="size-5 text-primary" />
          <span className="font-medium">Les modèles</span>
        </Link>
      </section>
    </div>
  );
}
