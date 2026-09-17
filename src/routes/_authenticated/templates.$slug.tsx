import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemberOverview, hasAccess, watermarkFor } from "@/hooks/useMemberOverview";
import { MemberGate } from "@/components/MemberGate";
import { WatermarkedContent } from "@/components/WatermarkedContent";
import { Markdown } from "@/components/Markdown";
import { findTemplate } from "@/lib/content";

export const Route = createFileRoute("/_authenticated/templates/$slug")({
  loader: ({ params }) => {
    const template = findTemplate(params.slug);
    if (!template) throw notFound();
    return { template };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.template.title ?? "Modèle indisponible";
    return {
      meta: [
        { title: `${title} — Modèles KPB Education` },
        { name: "description", content: loaderData?.template.summary ?? "Modèle du Club." },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: `${title} — Modèles KPB Education` },
        { property: "og:description", content: loaderData?.template.summary ?? "Modèle du Club." },
      ],
    };
  },
  notFoundComponent: TemplateNotFound,
  errorComponent: TemplateNotFound,
  component: TemplatePage,
});

function TemplateNotFound() {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-muted-foreground">Ce modèle n'existe pas.</p>
      <Link to="/templates" className="mt-3 inline-block text-sm text-primary underline">
        Retour aux modèles
      </Link>
    </div>
  );
}

function TemplatePage() {
  const { template } = Route.useLoaderData();
  const { data, isPending } = useMemberOverview();

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!data || !hasAccess(data.subscriptionState)) return <MemberGate />;

  return (
    <div>
      <Link
        to="/templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Les modèles
      </Link>
      <h1 className="mt-3 mb-4 font-display text-3xl font-semibold">{template.title}</h1>
      <WatermarkedContent watermark={watermarkFor(data.profile)}>
        <Markdown source={template.body} />
      </WatermarkedContent>
    </div>
  );
}
