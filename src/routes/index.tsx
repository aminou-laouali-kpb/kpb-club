import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, BookOpen, FileText, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { LaureatesWall } from "@/components/LaureatesWall";
import { PRICING, formatFcfa } from "@/lib/pricing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KPB Education — Club Boursier et accompagnement aux bourses" },
      {
        name: "description",
        content:
          "Vérifiez gratuitement votre éligibilité aux bourses d'études internationales, puis rejoignez le Club Boursier KPB Education pour être alerté et accompagné.",
      },
      { property: "og:title", content: "KPB Education — Club Boursier" },
      {
        property: "og:description",
        content:
          "Vérificateur d'éligibilité gratuit, alertes de bourses et guide de candidature pour les étudiants d'Afrique de l'Ouest.",
      },
    ],
  }),
  component: Landing,
});

const ARGUMENTS = [
  {
    icon: BellRing,
    title: "Alertes de fenêtres",
    text: "Vous êtes prévenu quand une bourse correspondant à votre profil ouvre.",
  },
  {
    icon: BookOpen,
    title: "Le guide complet",
    text: "Chapitre par chapitre : choisir, constituer le dossier, réussir l'entretien.",
  },
  {
    icon: FileText,
    title: "Modèles prêts",
    text: "CV académique, lettre de motivation, essai personnel, recommandation.",
  },
  {
    icon: ShieldCheck,
    title: "Crédit accompagnement",
    text: "5 000 FCFA cumulés chaque mois, déductibles d'un accompagnement.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-5xl px-4 pt-12 pb-14 md:pt-20">
          <p className="inline-flex rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent-foreground">
            Club Boursier — KPB Education
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight font-semibold md:text-5xl">
            Votre bourse d'études commence par un dossier qui répond aux bons critères.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Vérifiez gratuitement à quelles bourses vous êtes éligible. Puis laissez-nous vous
            prévenir dès qu'une fenêtre s'ouvre pour votre profil.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/verificateur"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Vérifier mon éligibilité <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center justify-center rounded-md border border-input bg-card px-6 py-3.5 font-medium transition-colors hover:bg-secondary"
            >
              J'ai déjà un compte
            </Link>
          </div>
        </section>

        <section className="border-y border-border bg-card/50">
          <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-2">
            {ARGUMENTS.map((item) => (
              <div key={item.title} className="flex gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="size-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pt-14">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-3xl font-semibold">Ils ont réussi</h2>
            <Link to="/laureats" className="text-sm font-medium text-primary">
              Tous les témoignages
            </Link>
          </div>
          <div className="mt-6">
            <LaureatesWall limit={3} />
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-display text-3xl font-semibold">Tarifs du Club</h2>
          <p className="mt-2 text-muted-foreground">Sans engagement. Renouvellement volontaire.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">Mensuel</p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {formatFcfa(PRICING.club.monthly.amount)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">30 jours d'accès complet.</p>
            </div>
            <div className="rounded-xl border-2 border-primary bg-card p-6">
              <p className="text-sm font-medium text-primary">Trimestriel — recommandé</p>
              <p className="mt-1 font-display text-3xl font-semibold">
                {formatFcfa(PRICING.club.quarterly.amount)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                90 jours, et 15 000 FCFA de crédit accompagnement d'un coup.
              </p>
            </div>
          </div>
          <div className="mt-10 rounded-xl bg-primary px-6 py-8 text-primary-foreground">
            <h2 className="font-display text-2xl font-semibold">
              Commencez par le vérificateur, c'est gratuit
            </h2>
            <p className="mt-2 text-primary-foreground/80">
              Cinq minutes pour savoir où vous en êtes réellement.
            </p>
            <Link
              to="/verificateur"
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Lancer le vérificateur <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        KPB Education — Club Boursier et accompagnement aux candidatures.
      </footer>
    </div>
  );
}
