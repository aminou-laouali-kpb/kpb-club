import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MemberGate } from "@/components/MemberGate";
import { listGuide } from "@/lib/content.functions";

export const Route = createFileRoute("/_authenticated/guide/")({
  head: () => ({
    meta: [
      { title: "Le guide de candidature — KPB Education" },
      {
        name: "description",
        content: "Le guide complet du Club Boursier : choisir, candidater, réussir l'entretien.",
      },
      { property: "og:title", content: "Le guide de candidature — KPB Education" },
      { property: "og:description", content: "Le guide complet réservé aux membres du Club." },
    ],
  }),
  component: GuideIndex,
});

function GuideIndex() {
  const fetchGuide = useServerFn(listGuide);
  const { data, isPending } = useQuery({ queryKey: ["guide"], queryFn: () => fetchGuide() });

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!data?.access) return <MemberGate />;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Le guide de candidature</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Chapitre par chapitre, de la sélection des programmes à l'entretien.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/templates"
          className="inline-flex rounded-md border border-border px-3 py-2 text-sm"
        >
          Voir les modèles (CV, lettres, essai)
        </Link>
        <Link
          to="/bibliotheque"
          className="inline-flex rounded-md border border-border px-3 py-2 text-sm"
        >
          Bibliothèque
        </Link>
        <Link
          to="/anglais"
          className="inline-flex rounded-md border border-border px-3 py-2 text-sm"
        >
          Parcours anglais
        </Link>
      </div>
      <div className="mt-6 space-y-3">
        {data.chapters.map((chapter, index) => (
          <Link
            key={chapter.slug}
            to="/guide/$chapter"
            params={{ chapter: chapter.slug }}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
          >
            <span className="font-display text-lg font-semibold text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="flex-1">
              <span className="block font-medium">{chapter.title}</span>
              <span className="block text-sm text-muted-foreground">{chapter.summary}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
