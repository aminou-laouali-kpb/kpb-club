import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron horaire : envoie les notifications dont l'heure est venue
 * (fenêtre 8 h – 20 h dans le fuseau de chaque membre).
 */
export const Route = createFileRoute("/api/public/hooks/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardCronRequest } = await import("@/lib/cron-guard.server");
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        const { dispatchPending } = await import("@/lib/notifications.server");
        return Response.json({ ok: true, ...(await dispatchPending(300)) });
      },
    },
  },
});
