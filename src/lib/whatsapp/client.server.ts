/** Client WhatsApp Business Cloud API (Graph API de Meta), via fetch. */

const GRAPH = "https://graph.facebook.com/v21.0";

export class WhatsAppError extends Error {}

function config() {
  const token = process.env["WHATSAPP_TOKEN"];
  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  if (!token || !phoneNumberId) throw new WhatsAppError("WhatsApp n'est pas configuré");
  return { token, phoneNumberId, lang: process.env["WHATSAPP_TEMPLATE_LANG"] ?? "fr" };
}

export function whatsappConfigured() {
  return Boolean(process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"]);
}

async function send(payload: Record<string, unknown>): Promise<string | null> {
  const { token, phoneNumberId } = config();
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const body = (await res.json().catch(() => null)) as {
    messages?: { id: string }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) throw new WhatsAppError(body?.error?.message ?? `WhatsApp HTTP ${res.status}`);
  return body?.messages?.[0]?.id ?? null;
}

const to = (e164: string) => e164.replace(/\D/g, "");

/** Code de connexion : modèle AUTHENTICATION avec bouton « copier le code ». */
export function sendOtpTemplate(phone: string, code: string) {
  const { lang } = config();
  return send({
    to: to(phone),
    type: "template",
    template: {
      name: process.env["WHATSAPP_OTP_TEMPLATE"] ?? "kpb_otp",
      language: { code: lang },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  });
}

/** Notification hors fenêtre de 24 h : modèle UTILITY à 3 variables (titre, message, lien). */
/** Modèles à 3 variables (titre, message, lien) : `kpb_notification` (UTILITY) ou `kpb_annonce` (MARKETING). */
export function sendNotificationTemplate(
  phone: string,
  params: [string, string, string],
  template: "kpb_notification" | "kpb_annonce" = "kpb_notification",
) {
  const { lang } = config();
  const name =
    template === "kpb_annonce"
      ? (process.env["WHATSAPP_ANNOUNCE_TEMPLATE"] ?? "kpb_annonce")
      : (process.env["WHATSAPP_NOTIFICATION_TEMPLATE"] ?? "kpb_notification");
  return send({
    to: to(phone),
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text: text.slice(0, 900) })),
        },
      ],
    },
  });
}

/** Texte libre : seulement dans les 24 h qui suivent un message du membre. */
export function sendText(phone: string, body: string) {
  return send({ to: to(phone), type: "text", text: { body, preview_url: true } });
}

export function sendList(
  phone: string,
  input: {
    body: string;
    button: string;
    rows: { id: string; title: string; description?: string }[];
  },
) {
  return send({
    to: to(phone),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: input.body.slice(0, 1024) },
      action: {
        button: input.button.slice(0, 20),
        sections: [
          {
            title: "Choix",
            rows: input.rows.slice(0, 10).map((r) => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/** Télécharge un média reçu (image ou PDF). */
export async function downloadMedia(mediaId: string) {
  const { token } = config();
  const meta = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) throw new WhatsAppError(`Média introuvable (${meta.status})`);
  const info = (await meta.json()) as { url: string; mime_type: string; file_size?: number };
  const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!file.ok) throw new WhatsAppError(`Téléchargement impossible (${file.status})`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: info.mime_type };
}
