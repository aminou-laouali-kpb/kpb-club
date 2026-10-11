/** Messages et règles du module recommandateurs. */
import { formatDateFr } from "./matching";

export type RecommenderStatus = "to_contact" | "requested" | "reminded" | "received" | "declined";

export const RECOMMENDER_STATUS_LABELS: Record<RecommenderStatus, string> = {
  to_contact: "À contacter",
  requested: "Demande envoyée",
  reminded: "Relancé",
  received: "Lettre reçue",
  declined: "A décliné",
};

export const REMIND_AFTER_DAYS = 7;

type MessageInput = {
  studentName: string;
  recommender: { full_name: string; title?: string | null };
  bourseName: string;
  deadline: string | null;
  strengths?: string | null;
};

function salutation(r: MessageInput["recommender"]) {
  const title = r.title?.trim();
  return title ? `Bonjour ${title} ${r.full_name},` : `Bonjour ${r.full_name},`;
}

export function buildRequestMessage(input: MessageInput) {
  const subject = `Demande de lettre de recommandation — ${input.bourseName}`;
  const deadline = input.deadline ? ` avant le ${formatDateFr(input.deadline)}` : "";
  const strengths = input.strengths?.trim()
    ? `\n\nPour vous aider, voici les points sur lesquels votre regard me serait précieux :\n${input.strengths
        .trim()
        .split(/\n+/)
        .map((l) => `- ${l.replace(/^[-•]\s*/, "")}`)
        .join("\n")}`
    : "";
  const body = `${salutation(input.recommender)}

Je prépare ma candidature à ${input.bourseName} et je souhaiterais vous demander une lettre de recommandation. Vous me connaissez bien et votre avis aurait beaucoup de poids auprès du comité de sélection.

La lettre doit être transmise${deadline}.${strengths}

Une lettre efficace tient en une page : comment vous me connaissez et depuis quand, deux ou trois exemples concrets de mon travail, et votre appréciation de ma capacité à réussir ce programme.

Je reste disponible pour vous transmettre mon CV ou tout autre élément utile. Merci beaucoup pour votre temps.

Bien cordialement,
${input.studentName}`;
  return { subject, body };
}

export function buildReminderMessage(input: MessageInput) {
  const subject = `Rappel — lettre de recommandation pour ${input.bourseName}`;
  const deadline = input.deadline ? ` La date limite est le ${formatDateFr(input.deadline)}.` : "";
  const body = `${salutation(input.recommender)}

Je me permets de revenir vers vous au sujet de la lettre de recommandation pour ma candidature à ${input.bourseName}.${deadline}

Si cela vous convient toujours, je vous remercie par avance. Si vous manquez de temps, n'hésitez pas à me le dire : je comprendrai tout à fait.

Bien cordialement,
${input.studentName}`;
  return { subject, body };
}

/** Lien WhatsApp avec message prérempli (numéro au format international, chiffres seuls). */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Relance due : demande envoyée depuis au moins 7 jours et jamais relancée. */
export function isReminderDue(
  r: { status: string; requested_at: string | null; reminded_at: string | null },
  now = Date.now(),
) {
  if (r.status !== "requested" || !r.requested_at || r.reminded_at) return false;
  return now - Date.parse(r.requested_at) >= REMIND_AFTER_DAYS * 86_400_000;
}

/** L'item « recommandations » est fait quand assez de lettres sont reçues. */
export function isRecommendationItemDone(receivedCount: number, required: number | null) {
  return receivedCount >= Math.max(1, required ?? 1);
}
