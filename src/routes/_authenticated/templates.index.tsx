import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, FileText } from "lucide-react";
import { useMemberOverview, hasAccess } from "@/hooks/useMemberOverview";
import { MemberGate } from "@/components/MemberGate";
import { TEMPLATES } from "@/lib/content";

export const Route = createFileRoute("/_authenticated/templates/")({
  head: () => ({
    meta: [
      { title: "Les modèles — KPB Education" },
      {
        name: "description",
        content: "CV académique, lettre de motivation, essai personnel et lettre de recommandation.",
      },
      { property: "og:title", content: "Les modèles — KPB Education" },
      { property: "og:description", content: "Les modèles de dossier réservés aux membres." },
    ],
  }),
  component: TemplatesIndex,
});

function TemplatesIndex() {
  const { data, isPending } = useMemberOverview();

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!hasAccess(data?.subscriptionState)) return <MemberGate />;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Les modèles</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        À lire et recopier dans votre propre document. Consultation en ligne uniquement.
      </p>
      <div className="mt-6 space-y-3">
        {TEMPLATES.map((tpl) => (
          <Link
            key={tpl.slug}
            to="/templates/$slug"
            params={{ slug: tpl.slug }}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
          >
            <FileText className="size-5 shrink-0 text-primary" />
            <span className="flex-1">
              <span className="block font-medium">{tpl.title}</span>
              <span className="block text-sm text-muted-foreground">{tpl.summary}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
