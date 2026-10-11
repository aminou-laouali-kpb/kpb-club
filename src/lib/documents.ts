/** Coffre-fort documents : types, quotas, expirations et noms de fichiers. */

export type DocumentType =
  | "passport"
  | "id_card"
  | "birth_certificate"
  | "photo_id"
  | "diploma_bac"
  | "diploma_licence"
  | "diploma_master"
  | "transcript"
  | "cv"
  | "motivation_letter"
  | "recommendation_letter"
  | "english_test"
  | "proof_of_income"
  | "proof_of_residence"
  | "other";

export const DOCUMENT_TYPES: { value: DocumentType; label: string; expires?: boolean }[] = [
  { value: "passport", label: "Passeport", expires: true },
  { value: "id_card", label: "Carte d'identité", expires: true },
  { value: "birth_certificate", label: "Acte de naissance" },
  { value: "photo_id", label: "Photo d'identité" },
  { value: "diploma_bac", label: "Diplôme du baccalauréat" },
  { value: "diploma_licence", label: "Diplôme de licence" },
  { value: "diploma_master", label: "Diplôme de master" },
  { value: "transcript", label: "Relevé de notes" },
  { value: "cv", label: "CV" },
  { value: "motivation_letter", label: "Lettre de motivation" },
  { value: "recommendation_letter", label: "Lettre de recommandation" },
  { value: "english_test", label: "Résultat de test d'anglais", expires: true },
  { value: "proof_of_income", label: "Justificatif de revenus" },
  { value: "proof_of_residence", label: "Justificatif de domicile" },
  { value: "other", label: "Autre document" },
];

export function documentTypeLabel(type: string | null | undefined) {
  return DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? "Document";
}

export function typeExpires(type: string) {
  return Boolean(DOCUMENT_TYPES.find((t) => t.value === type)?.expires);
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FREE_DOCUMENT_LIMIT = 3;
export const MEMBER_STORAGE_BYTES = 200 * 1024 * 1024;

export type QuotaCheck = { ok: true } | { ok: false; reason: string };

export function checkQuota(input: {
  hasAccess: boolean;
  documentCount: number;
  usedBytes: number;
  newBytes: number;
}): QuotaCheck {
  if (input.newBytes <= 0) return { ok: false, reason: "Fichier vide." };
  if (input.newBytes > MAX_FILE_BYTES) {
    return { ok: false, reason: "Fichier trop lourd (10 Mo maximum)." };
  }
  if (!input.hasAccess && input.documentCount >= FREE_DOCUMENT_LIMIT) {
    return {
      ok: false,
      reason: `Le compte gratuit permet de stocker ${FREE_DOCUMENT_LIMIT} documents. Rejoignez le Club pour un coffre-fort de 200 Mo.`,
    };
  }
  if (input.hasAccess && input.usedBytes + input.newBytes > MEMBER_STORAGE_BYTES) {
    return { ok: false, reason: "Votre coffre-fort est plein (200 Mo). Supprimez un document." };
  }
  return { ok: true };
}

export type ExpiryState = "ok" | "soon" | "expired" | "none";

/** Expire bientôt : moins de 90 jours (délai réaliste pour renouveler un passeport). */
export function expiryState(expiresAt: string | null, now = Date.now()): ExpiryState {
  if (!expiresAt) return "none";
  const end = Date.parse(`${expiresAt.slice(0, 10)}T23:59:59Z`);
  if (end < now) return "expired";
  if (end - now < 90 * 86_400_000) return "soon";
  return "ok";
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Nom d'export : NOM_Prenom_Libelle.pdf, sans accents ni caractères spéciaux. */
export function exportFileName(fullName: string, label: string, ext = "pdf") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const last = parts.at(-1) ?? "";
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const name = [
    slug(last).toUpperCase(),
    slug(first).replace(/(^|_)([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase()),
  ]
    .filter(Boolean)
    .join("_");
  return `${[name, slug(label)].filter(Boolean).join("_") || "document"}.${ext}`;
}

/** Évite deux fichiers de même nom dans une archive. */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0
      ? `${name.slice(0, dot)}_${count + 1}${name.slice(dot)}`
      : `${name}_${count + 1}`;
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
