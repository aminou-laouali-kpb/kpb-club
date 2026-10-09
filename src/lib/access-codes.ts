/** Alphabet sans caractères ambigus (pas de O/0, I/1) : 32 symboles, 5 bits chacun. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 16;

/** Génère un code de 16 caractères avec un tirage cryptographique. */
export function generateAccessCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 est un multiple de 32 : le modulo ne biaise pas le tirage
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Normalise une saisie : majuscules, sans espaces ni tirets. */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidAccessCodeFormat(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** Affichage lisible : XXXX-XXXX-XXXX-XXXX. */
export function formatAccessCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}
