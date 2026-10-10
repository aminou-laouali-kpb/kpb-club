/** Choix des canaux d'envoi selon le type de message et les préférences du membre. */

export type NotificationCategory = "alerts" | "reminders" | "content";

export type Prefs = {
  email: string | null;
  phone_e164: string | null;
  phone_verified_at: string | null;
  email_optin: boolean;
  notif_email: boolean;
  whatsapp_optin: boolean;
  notif_whatsapp_alerts: boolean;
  notif_whatsapp_reminders: boolean;
  notif_whatsapp_content: boolean;
};

/** Catégorie d'un type de notification (`kind` de la file). */
export function categoryOf(kind: string): NotificationCategory {
  if (kind.startsWith("bourse_alert")) return "alerts";
  if (kind.startsWith("content")) return "content";
  return "reminders";
}

/** Les messages transactionnels partent toujours (paiement reçu, récompense, réponse de l'équipe). */
const TRANSACTIONAL = ["payment_success", "referral_reward", "support_reply"];

export function channelsFor(kind: string, p: Prefs): { email: boolean; whatsapp: boolean } {
  const category = categoryOf(kind);
  const waReady = Boolean(p.phone_e164 && p.phone_verified_at) && p.whatsapp_optin;
  const whatsapp =
    waReady &&
    (category === "alerts"
      ? p.notif_whatsapp_alerts
      : category === "content"
        ? p.notif_whatsapp_content
        : p.notif_whatsapp_reminders);
  const emailAllowed = Boolean(p.email) && p.email_optin && p.notif_email;
  const transactional = TRANSACTIONAL.some((t) => kind.startsWith(t));
  // Jamais de désabonnement silencieux : sans WhatsApp, l'email reste le filet de sécurité
  const email =
    emailAllowed || (Boolean(p.email) && !whatsapp && (transactional || category === "reminders"));
  return { email, whatsapp };
}
