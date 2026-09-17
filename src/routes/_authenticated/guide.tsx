import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemberOverview, hasAccess } from "@/hooks/useMemberOverview";
import { MemberGate } from "@/components/MemberGate";
import { GUIDE_CHAPTERS } from "@/lib/content";

export const Route = createFileRoute("/_authenticated/guide")({
  component: GuideLayout,
});

function GuideLayout() {
  return <Outlet />;
}

export function GuideIndex() {
  const { data, isPending } = useMemberOverview();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  void pathname;

  if (isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (!hasAccess(data?.subscriptionState)) return <MemberGate />;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Le guide de candidature</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Chapitre par chapitre, de la sélection des programmes à l'entretien.
      </p>
      <div className="mt-6 space-y-3">
        {GUIDE_CHAPTERS.map((chapter, index) => (
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
