/** Garde-fous du coach IA : pas de rédaction à la place de l'étudiant, pas de données sensibles. */

export const WRITING_REFUSAL =
  "Je ne rédige pas à ta place : un texte écrit par une IA se repère et peut disqualifier ta candidature. Utilise les modèles de la plateforme pour structurer ton texte, puis fais-le analyser ici. Pour être accompagné pas à pas, l'accompagnement KPB est fait pour ça.";

// Motifs écrits sans accents : le texte est normalisé avant le test
const WRITING_PATTERNS = [
  /\becri[st]?[- ]?(moi|nous)\b/,
  /\becris\b.{0,40}\b(essai|lettre|cv|texte|motivation|introduction|conclusion|paragraphe)/,
  /\bredige[sz]?\b/,
  /\bpeux[- ]tu (m'?)?ecrire\b/,
  /\bfais[- ]moi (un|une|mon|ma)\b.{0,30}\b(essai|lettre|cv|texte)/,
  /\b(re)?formule[- ]?(moi|le|la|ce)\b/,
  /\breecri[st]\b/,
  /\b(write|draft|rewrite)\b.{0,30}\b(my|an|a|the)\b.{0,20}\b(essay|letter|cv|resume|statement|paragraph)/,
];

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Demande explicite de rédaction (« écris-moi… », « rédige… », « write my essay »). */
export function detectWritingRequest(text: string): boolean {
  const t = normalize(text);
  return WRITING_PATTERNS.some((re) => re.test(t));
}

const IDENTITY_TYPES = new Set(["passport", "id_card", "birth_certificate", "photo_id"]);

/** Les pièces d'identité ne sont jamais envoyées à l'IA (spec §12.6). */
export function isIdentityDocument(type: string | null | undefined) {
  return Boolean(type && IDENTITY_TYPES.has(type));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Retire nom, prénoms, email et numéros de téléphone avant envoi à l'API. */
export function anonymize(
  text: string,
  profile: { full_name?: string | null; email?: string | null; phone?: string | null },
) {
  let out = text;
  if (profile.email) out = out.replace(new RegExp(escapeRegExp(profile.email), "gi"), "[email]");
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
  out = out.replace(/(?:\+|00)\d[\d\s.-]{7,}\d/g, "[téléphone]");
  if (profile.phone) {
    const digits = profile.phone.replace(/\D/g, "");
    if (digits.length >= 8)
      out = out.replace(new RegExp(digits.split("").join("[\\s.-]?"), "g"), "[téléphone]");
  }
  const names = (profile.full_name ?? "")
    .split(/\s+/)
    .map((n) => n.trim())
    .filter((n) => n.length >= 3);
  for (const name of names) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), "[nom]");
  }
  return out;
}

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
