import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Markdown } from "@/components/Markdown";
import { PRIVACY_MD } from "@/lib/legal";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({ meta: [{ title: "Politique de données — KPB Education" }] }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-4xl font-semibold">Politique de données</h1>
        <div className="prose prose-sm mt-6 max-w-none">
          <Markdown source={PRIVACY_MD} />
        </div>
      </main>
    </div>
  );
}
