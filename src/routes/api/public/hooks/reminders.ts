import { createFileRoute } from "@tanstack/react-router";

/** Cron quotidien : met en file toutes les relances, puis envoie celles déjà dues. */
export const Route = createFileRoute("/api/public/hooks/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardCronRequest } = await import("@/lib/cron-guard.server");
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        const { runDailyRelance } = await import("@/lib/relance/engine.server");
        const { dispatchPending } = await import("@/lib/notifications.server");
        const results = await runDailyRelance();
        const dispatch = await dispatchPending();
        return Response.json({ ok: true, ...results, ...dispatch });
      },
    },
  },
});
