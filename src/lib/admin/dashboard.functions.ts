import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./guard";
import { fetchAll } from "./fetch-all";

const DAY = 86_400_000;

/** Indicateurs du tableau de bord (spec §16) et vues analytics (spec §17). */
export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await import("../metrics");
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY).toISOString();
    const since7m = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1),
    ).toISOString();

    const [subs, profiles, engagements, activity, stats, churnEvents] = await Promise.all([
      fetchAll((from, to) =>
        supabaseAdmin
          .from("subscriptions")
          .select("id, profile_id, plan, amount, ends_at, grace_ends_at, status, source")
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabaseAdmin.from("profiles").select("id, created_at").order("id").range(from, to),
      ),
      fetchAll((from, to) =>
        supabaseAdmin
          .from("engagements")
          .select("profile_id")
          .gt("paid_amount", 0)
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabaseAdmin.rpc("admin_activity_months", { _since: since7m }).range(from, to),
      ),
      supabaseAdmin.rpc("admin_dashboard_stats", { _since: since30 }),
      supabaseAdmin
        .from("events")
        .select("profile_id, name, created_at")
        .eq("name", "churned")
        .gte("created_at", since7m)
        .limit(500),
    ]);
    if (stats.error) throw new Error(stats.error.message);

    // Événements d'usage des membres partis, pour la vue « avant le churn »
    const churned = churnEvents.data ?? [];
    const churnedIds = [...new Set(churned.map((e) => e.profile_id).filter(Boolean))] as string[];
    const usage =
      churnedIds.length === 0
        ? []
        : await fetchAll((from, to) =>
            supabaseAdmin
              .from("events")
              .select("profile_id, name, created_at")
              .in("profile_id", churnedIds.slice(0, 300))
              .gte("created_at", new Date(new Date(since7m).getTime() - 30 * DAY).toISOString())
              .order("id")
              .range(from, to),
          );

    // Activité mensuelle → événements synthétiques (un par mois actif) pour le calcul des cohortes
    const activityEvents = activity.map((a) => ({
      profile_id: a.profile_id,
      name: "active",
      created_at: `${a.month}-15T00:00:00Z`,
    }));
    const paidClub = subs.filter((s) => s.source !== "grant").map((s) => s.profile_id);

    return {
      generatedAt: now.toISOString(),
      kpis: {
        activeMembers: m.activeMembers(subs, now),
        mrr: m.mrr(subs, now),
        renewals7d: m.renewalsDue(subs, now, 7),
        churn: m.monthlyChurn(subs, now),
        totalMembers: profiles.length,
        ...(stats.data as {
          alerts_sent: number;
          ai_calls: number;
          ai_cost_usd: number;
          chapters_read: number;
          signups: number;
          avg_readiness: number;
          ai_by_feature: Record<string, { calls: number; cost: number }>;
        }),
      },
      cohorts: m.cohortRetention(profiles, activityEvents, now, 6),
      funnel: m.funnel({
        profileIds: profiles.map((p) => p.id),
        clubProfileIds: paidClub,
        accompanimentProfileIds: engagements.map((e) => e.profile_id),
      }),
      beforeChurn: m.featuresBeforeChurn([
        ...churned,
        ...usage.filter((e) => e.name !== "churned"),
      ]),
    };
  });
