import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemberOverview, hasAccess, watermarkFor } from "@/hooks/useMemberOverview";
import { MemberGate } from "@/components/MemberGate";
import { WatermarkedContent } from "@/components/WatermarkedContent";
import { Markdown } from "@/components/Markdown";
import { findGuideChapter, GUIDE_CHAPTERS } from "@/lib/content";

export const Route = createFileRoute("/_authenticated/guide/$chapter")({
  loader: ({ params }) => {
    const chapter = findGuideChapter(params.chapter);
    if (!chapter) throw notFound();
    return { chapter };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.chapter.title ?? "Chapitre indisponible";
    return {
      meta: [
        { title: `${title} — Guide KPB Education` },
        { name: "description", content: loaderData?.chapter.summary ?? "Chapitre du guide." },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: `${title} — Guide KPB Education` },
        { property: "og:description", content: loaderData?.chapter.summary ?? "Guide du Club." },
      ],
    };
  },
  notFoundComponent: ChapterNotFound,
  errorComponent: ChapterNotFound,
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
  const { chapter } = Route.useLoaderData();
  const { data, isPending } = useMemberOverview();
  const index = GUIDE_CHAPTERS.findIndex((c) => c.slug === chapter.slug);
  const next = GUIDE_CHAPTERS[index + 1];

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!data || !hasAccess(data.subscriptionState)) return <MemberGate />;

  return (
    <div>
      <Link
        to="/guide"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Le guide
      </Link>
      <h1 className="mt-3 mb-4 font-display text-3xl font-semibold">{chapter.title}</h1>
      <WatermarkedContent watermark={watermarkFor(data.profile)}>
        <Markdown content={chapter.body} />
      </WatermarkedContent>
      {next && (
        <Link
          to="/guide/$chapter"
          params={{ chapter: next.slug }}
          className="mt-6 block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
        >
          <span className="text-xs text-muted-foreground">Chapitre suivant</span>
          <span className="mt-1 block font-medium">{next.title}</span>
        </Link>
      )}
    </div>
  );
}
