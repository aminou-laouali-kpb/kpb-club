import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { MemberGate } from "@/components/MemberGate";
import { WatermarkedContent } from "@/components/WatermarkedContent";
import { Markdown } from "@/components/Markdown";
import { getTemplate } from "@/lib/content.functions";

export const Route = createFileRoute("/_authenticated/templates/$slug")({
  head: () => ({
    meta: [{ title: "Modèle — KPB Education" }, { name: "robots", content: "noindex" }],
  }),
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
  const { slug } = Route.useParams();
  const fetchTemplate = useServerFn(getTemplate);
  const { data, isPending } = useQuery({
    queryKey: ["template", slug],
    queryFn: () => fetchTemplate({ data: { slug } }),
  });

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!data?.found) return <TemplateNotFound />;
  if (!data.access) return <MemberGate />;

  return (
    <div>
      <Link
        to="/templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Les modèles
      </Link>
      <h1 className="mt-3 mb-4 font-display text-3xl font-semibold">{data.title}</h1>
      <WatermarkedContent watermark={data.watermark}>
        <Markdown source={data.body} />
      </WatermarkedContent>
    </div>
  );
}
