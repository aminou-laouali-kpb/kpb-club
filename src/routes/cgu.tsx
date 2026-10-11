import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Markdown } from "@/components/Markdown";
import { TERMS_MD } from "@/lib/legal";

export const Route = createFileRoute("/cgu")({
  head: () => ({ meta: [{ title: "Conditions d'utilisation — KPB Education" }] }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-4xl font-semibold">Conditions d'utilisation</h1>
        <div className="prose prose-sm mt-6 max-w-none">
          <Markdown source={TERMS_MD} />
        </div>
      </main>
    </div>
  );
}
