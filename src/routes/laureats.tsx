import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { LaureatesWall } from "@/components/LaureatesWall";

export const Route = createFileRoute("/laureats")({
  head: () => ({
    meta: [
      { title: "Ils ont obtenu leur bourse — KPB Education" },
      {
        name: "description",
        content: "Témoignages vérifiés d'étudiants accompagnés par KPB Education.",
      },
      { property: "og:title", content: "Les lauréats KPB Education" },
    ],
  }),
  component: Laureats,
});

function Laureats() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="font-display text-4xl font-semibold">Ils ont obtenu leur bourse</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Chaque témoignage est vérifié et publié avec l'accord écrit de son auteur.
        </p>
        <div className="mt-8">
          <LaureatesWall />
        </div>
        <Link
          to="/verificateur"
          className="mt-10 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground"
        >
          Vérifier mon éligibilité <ArrowRight className="size-4" />
        </Link>
      </main>
    </div>
  );
}
