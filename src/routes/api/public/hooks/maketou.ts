import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook Maketou : appelé quand l'état d'un panier change.
 * URL à déclarer chez Maketou : {APP_URL}/api/public/hooks/maketou?token={MAKETOU_WEBHOOK_SECRET}
 */
export const Route = createFileRoute("/api/public/hooks/maketou")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyWebhookToken, parseCart } = await import("@/lib/maketou.server");
        if (!(await verifyWebhookToken(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }
        const cart = parseCart(body);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let paymentId = cart.paymentId;
        if (!paymentId && cart.externalId) {
          const { data } = await supabaseAdmin
            .from("payments")
            .select("id")
            .eq("provider", "maketou")
            .eq("external_id", cart.externalId)
            .maybeSingle();
          paymentId = data?.id ?? null;
        }
        // Événement qui ne concerne aucun paiement connu : accusé de réception sans action
        if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) {
          return Response.json({ ok: true, ignored: true });
        }

        try {
          const { reconcilePayment } = await import("@/lib/payments.server");
          const result = await reconcilePayment(paymentId, cart);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("Maketou webhook", e);
          // 500 : Maketou pourra renvoyer l'événement
          return Response.json({ error: "processing_failed" }, { status: 500 });
        }
      },
    },
  },
});
