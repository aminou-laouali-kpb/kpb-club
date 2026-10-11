import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { compact, optionalEnum } from "@/lib/search-params";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAdminBourses } from "@/lib/admin/bourses.functions";
import { DashboardPanel } from "@/components/admin/DashboardPanel";
import { MembersPanel } from "@/components/admin/MembersPanel";
import { BoursesPanel, ADMIN_BOURSES_KEY } from "@/components/admin/BoursesPanel";
import { ContentPanel } from "@/components/admin/ContentPanel";
import { LaureatesPanel } from "@/components/admin/LaureatesPanel";
import { BroadcastPanel } from "@/components/admin/BroadcastPanel";
import { ReviewPanel } from "@/components/admin/ReviewPanel";
import { PaymentsPanel } from "@/components/admin/PaymentsPanel";

const TABS = {
  dashboard: "Tableau de bord",
  members: "Membres",
  bourses: "Bourses",
  content: "Contenus",
  laureates: "Lauréats",
  broadcast: "Diffusion",
  review: "Accompagnement",
  payments: "Paiements & codes",
} as const;
type Tab = keyof typeof TABS;

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (search: Record<string, unknown>) =>
    compact({ tab: optionalEnum(search["tab"], Object.keys(TABS) as Tab[]) }),
  head: () => ({
    meta: [{ title: "Administration — KPB Education" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

function Admin() {
  const { tab = "dashboard" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchBourses = useServerFn(listAdminBourses);
  // Sert aussi de contrôle d'accès : la requête échoue pour un non-admin
  const bourses = useQuery({
    queryKey: ADMIN_BOURSES_KEY,
    queryFn: () => fetchBourses(),
    retry: false,
  });

  if (bourses.isPending) return <p className="py-10 text-sm text-muted-foreground">Chargement…</p>;
  if (bourses.isError || !bourses.data)
    return (
      <p className="py-10 text-sm text-muted-foreground">Cette page est réservée à l'équipe KPB.</p>
    );

  const bourseOptions = bourses.data.bourses.map((b) => ({
    id: b.id,
    university_name: b.university_name,
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Administration</h1>
      <Tabs value={tab} onValueChange={(v) => void navigate({ search: { tab: v as Tab } })}>
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList className="w-max">
            {Object.entries(TABS).map(([key, text]) => (
              <TabsTrigger key={key} value={key}>
                {text}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="dashboard" className="mt-6">
          <DashboardPanel />
        </TabsContent>
        <TabsContent value="members" className="mt-6">
          <MembersPanel bourses={bourseOptions} />
        </TabsContent>
        <TabsContent value="bourses" className="mt-6">
          <BoursesPanel bourses={bourses.data.bourses} requirements={bourses.data.requirements} />
        </TabsContent>
        <TabsContent value="content" className="mt-6">
          <ContentPanel bourses={bourseOptions} />
        </TabsContent>
        <TabsContent value="laureates" className="mt-6">
          <LaureatesPanel bourses={bourseOptions} />
        </TabsContent>
        <TabsContent value="broadcast" className="mt-6">
          <BroadcastPanel bourses={bourseOptions} />
        </TabsContent>
        <TabsContent value="review" className="mt-6">
          <ReviewPanel />
        </TabsContent>
        <TabsContent value="payments" className="mt-6">
          <PaymentsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
