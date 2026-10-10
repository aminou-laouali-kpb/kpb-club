import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { MemberGate } from "@/components/MemberGate";
import { WatermarkedContent } from "@/components/WatermarkedContent";
import { Markdown } from "@/components/Markdown";
import { getChapter } from "@/lib/content.functions";

export const Route = createFileRoute("/_authenticated/guide/$chapter")({
  head: () => ({
    meta: [{ title: "Guide — KPB Education" }, { name: "robots", content: "noindex" }],
  }),
  component: ChapterPage,
});

function ChapterNotFound() {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-muted-foreground">Ce chapitre n'existe pas.</p>
      <Link to="/guide" className="mt-3 inline-block text-sm text-primary underline">
        Retour au guide
      </Link>
    </div>
  );
}

function ChapterPage() {
  const { chapter: slug } = Route.useParams();
  const fetchChapter = useServerFn(getChapter);
  const { data, isPending } = useQuery({
    queryKey: ["chapter", slug],
    queryFn: () => fetchChapter({ data: { slug } }),
  });

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!data?.found) return <ChapterNotFound />;
  if (!data.access) return <MemberGate />;

  return (
    <div>
      <Link
        to="/guide"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Le guide
      </Link>
      <h1 className="mt-3 mb-4 font-display text-3xl font-semibold">{data.title}</h1>
      <WatermarkedContent watermark={data.watermark}>
        <Markdown source={data.body} />
      </WatermarkedContent>
      {data.next && (
        <Link
          to="/guide/$chapter"
          params={{ chapter: data.next.slug }}
          className="mt-6 block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
        >
          <span className="text-xs text-muted-foreground">Chapitre suivant</span>
          <span className="mt-1 block font-medium">{data.next.title}</span>
        </Link>
      )}
    </div>
  );
}
