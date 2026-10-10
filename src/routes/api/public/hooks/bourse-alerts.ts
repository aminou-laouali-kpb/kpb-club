import { createFileRoute } from "@tanstack/react-router";
import { matchBourses, formatDateFr, type Bourse } from "@/lib/matching";

export const Route = createFileRoute("/api/public/hooks/bourse-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardCronRequest } = await import("@/lib/cron-guard.server");
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { queueNotifications, dispatchPending } = await import("@/lib/notifications.server");
        const { nextSendTime } = await import("@/lib/relance/window");

        const now = Date.now();

        const [{ data: bourses }, { data: subs }, { data: alerts }] = await Promise.all([
          supabaseAdmin.from("bourses").select("*").eq("window_confirmed", true),
          supabaseAdmin
            .from("subscriptions")
            .select("profile_id, ends_at, grace_ends_at")
            .in("status", ["active", "grace"]),
          supabaseAdmin.from("alerts_log").select("profile_id, bourse_id").eq("channel", "email"),
        ]);

        const activeProfileIds = new Set(
          (subs ?? [])
            .filter((s) => {
              const grace = s.grace_ends_at
                ? new Date(s.grace_ends_at).getTime()
                : new Date(s.ends_at).getTime();
              return now <= grace;
            })
            .map((s) => s.profile_id),
        );
        if (activeProfileIds.size === 0) {
          return Response.json({ ok: true, queued: 0, sent: 0 });
        }

        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .in("id", [...activeProfileIds])
          .eq("email_optin", true);

        const already = new Set((alerts ?? []).map((a) => `${a.profile_id}:${a.bourse_id}`));
        const queue = [];
        const logs: Array<{ profile_id: string; bourse_id: string; channel: string }> = [];

        for (const profile of profiles ?? []) {
          const matches = matchBourses(profile, (bourses ?? []) as unknown as Bourse[]).filter(
            (b) => !already.has(`${profile.id}:${b.id}`),
          );
          if (matches.length === 0) continue;

          const lines = matches
            .map(
              (b) =>
                `• ${b.university_name} (${b.country}) — dépôt du ${formatDateFr(b.window_opens)} au ${formatDateFr(b.window_closes)}`,
            )
            .join("\n");

          queue.push({
            profile_id: profile.id,
            recipient: profile.email,
            kind: "bourse_alert",
            subject:
              matches.length === 1
                ? "Une bourse compatible vient d'ouvrir"
                : `${matches.length} bourses compatibles viennent d'ouvrir`,
            body: `Bonjour ${profile.full_name || "cher membre"},\n\nCes fenêtres correspondent à votre profil :\n\n${lines}\n\nRetrouvez le détail dans votre espace membre.\n\nL'équipe KPB Education`,
            dedupe_key: `alert:${profile.id}:${matches.map((m) => m.id).join("-")}`,
            send_after: nextSendTime(new Date(), profile.timezone).toISOString(),
          });
          for (const m of matches) {
            logs.push({ profile_id: profile.id, bourse_id: m.id, channel: "email" });
          }
        }

        const queued = await queueNotifications(queue);
        if (logs.length > 0) {
          await supabaseAdmin.from("alerts_log").insert(logs);
        }
        const dispatch = await dispatchPending();

        return Response.json({ ok: true, queued, ...dispatch });
      },
    },
  },
});
