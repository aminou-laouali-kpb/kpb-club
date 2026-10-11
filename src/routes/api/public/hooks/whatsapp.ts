import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook WhatsApp Cloud API.
 * GET : vérification par Meta. POST : messages reçus et statuts de livraison (signés).
 */
export const Route = createFileRoute("/api/public/hooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (
          expected &&
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === expected
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_APP_SECRET"];
        const raw = await request.text();
        if (!secret) return new Response("Not configured", { status: 503 });
        const { verifyMetaSignature } = await import("@/lib/whatsapp/signature");
        if (!(await verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret))) {
          return new Response("Invalid signature", { status: 401 });
        }

        type Payload = {
          entry?: {
            changes?: {
              value?: {
                messages?: import("@/lib/whatsapp/bot.server").Inbound[];
                statuses?: { id: string; status: string }[];
              };
            }[];
          }[];
        };
        let payload: Payload;
        try {
          payload = JSON.parse(raw) as Payload;
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { handleInbound, handleStatus } = await import("@/lib/whatsapp/bot.server");
        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            for (const status of change.value?.statuses ?? []) {
              await handleStatus(status).catch((e) => console.error("WhatsApp status", e));
            }
            for (const message of change.value?.messages ?? []) {
              // Une erreur sur un message ne doit pas faire renvoyer tout le lot par Meta
              await handleInbound(message).catch((e) => console.error("WhatsApp message", e));
            }
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
