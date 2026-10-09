import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, FileText } from "lucide-react";
import { useMemberOverview, hasAccess } from "@/hooks/useMemberOverview";
import { formatDateFr } from "@/lib/matching";
import { formatFcfa } from "@/lib/pricing";
import { AccessCodeForm } from "@/components/AccessCodeForm";

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

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (isError || !data)
    return (
      <p className="py-10 text-sm text-muted-foreground">Impossible de charger votre espace.</p>
    );

  const { profile, subscriptionState, daysLeft, matches } = data;
  const access = hasAccess(subscriptionState);

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
              <div key={b.id} className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-display text-lg font-semibold">{b.university_name}</h3>
                <p className="text-sm text-muted-foreground">
                  Date limite : {formatDateFr(b.window_closes)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

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
