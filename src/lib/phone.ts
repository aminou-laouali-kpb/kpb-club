/** Numéros de téléphone : saisie locale ou internationale → format E.164. */

export const DIAL_CODES: {
  country: string;
  code: string;
  label: string;
  nationalLength: number;
}[] = [
  { country: "NE", code: "227", label: "Niger", nationalLength: 8 },
  { country: "SN", code: "221", label: "Sénégal", nationalLength: 9 },
  { country: "CI", code: "225", label: "Côte d'Ivoire", nationalLength: 10 },
  { country: "CM", code: "237", label: "Cameroun", nationalLength: 9 },
  { country: "BJ", code: "229", label: "Bénin", nationalLength: 10 },
  { country: "BF", code: "226", label: "Burkina Faso", nationalLength: 8 },
  { country: "ML", code: "223", label: "Mali", nationalLength: 8 },
  { country: "TG", code: "228", label: "Togo", nationalLength: 8 },
  { country: "GN", code: "224", label: "Guinée", nationalLength: 9 },
  { country: "CD", code: "243", label: "RD Congo", nationalLength: 9 },
  { country: "TD", code: "235", label: "Tchad", nationalLength: 8 },
  { country: "GA", code: "241", label: "Gabon", nationalLength: 8 },
  { country: "CG", code: "242", label: "Congo", nationalLength: 9 },
  { country: "MR", code: "222", label: "Mauritanie", nationalLength: 8 },
  { country: "MA", code: "212", label: "Maroc", nationalLength: 9 },
  { country: "TN", code: "216", label: "Tunisie", nationalLength: 8 },
  { country: "FR", code: "33", label: "France", nationalLength: 9 },
  { country: "BE", code: "32", label: "Belgique", nationalLength: 9 },
  { country: "CA", code: "1", label: "Canada", nationalLength: 10 },
];

/**
 * Normalise un numéro en E.164 (« +22790123456 »), ou null s'il est invalide.
 * Accepte « +227… », « 00227… », « 227… » ou un numéro national avec l'indicatif par défaut.
 */
export function normalizePhone(input: string, defaultCountry = "NE"): string | null {
  const raw = input.trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    const known = DIAL_CODES.find(
      (d) => digits.startsWith(d.code) && digits.length === d.code.length + d.nationalLength,
    );
    if (!known) {
      const home = DIAL_CODES.find((d) => d.country === defaultCountry) ?? DIAL_CODES[0]!;
      // Le 0 national (France, Maroc, RDC…) disparaît au format international
      const national =
        digits.length === home.nationalLength + 1 && digits.startsWith("0")
          ? digits.slice(1)
          : digits;
      if (national.length !== home.nationalLength) return null;
      digits = home.code + national;
    }
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Affichage discret : +227 •• •• 34 56. */
export function maskPhone(e164: string) {
  const digits = e164.replace(/\D/g, "");
  return `+${digits.slice(0, digits.length - 4).replace(/\d/g, (d, i) => (i < 3 ? d : "•"))} ${digits.slice(-4, -2)} ${digits.slice(-2)}`;
}

/** Adresse technique d'un compte créé par code WhatsApp (jamais utilisée pour écrire). */
export function syntheticEmail(e164: string) {
  return `${e164.replace(/\D/g, "")}@phone.kpb.invalid`;
}

export function isSyntheticEmail(email: string | null | undefined) {
  return Boolean(email?.endsWith("@phone.kpb.invalid"));
}
