export const COUNTRIES: { code: string; name: string }[] = [
  { code: "NE", name: "Niger" },
  { code: "SN", name: "Sénégal" },
  { code: "ML", name: "Mali" },
  { code: "BF", name: "Burkina Faso" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "TG", name: "Togo" },
  { code: "BJ", name: "Bénin" },
  { code: "GN", name: "Guinée" },
  { code: "TD", name: "Tchad" },
  { code: "CM", name: "Cameroun" },
  { code: "CD", name: "RD Congo" },
  { code: "CG", name: "Congo" },
  { code: "GA", name: "Gabon" },
  { code: "MR", name: "Mauritanie" },
  { code: "MA", name: "Maroc" },
  { code: "DZ", name: "Algérie" },
  { code: "TN", name: "Tunisie" },
  { code: "FR", name: "France" },
  { code: "CA", name: "Canada" },
  { code: "BE", name: "Belgique" },
  { code: "OTHER", name: "Autre pays" },
];

export function countryName(code?: string | null): string {
  if (!code) return "—";
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export const EDUCATION_OPTIONS = [
  { value: "bac", label: "Baccalauréat" },
  { value: "licence", label: "Licence" },
  { value: "master", label: "Master" },
  { value: "doctorat", label: "Doctorat" },
  { value: "autre", label: "Autre" },
] as const;

export const ENGLISH_OPTIONS = [
  { value: "none", label: "Aucun" },
  { value: "basic", label: "Notions" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "advanced", label: "Avancé" },
  { value: "native", label: "Bilingue" },
] as const;

export const GENDER_OPTIONS = [
  { value: "F", label: "Femme" },
  { value: "M", label: "Homme" },
  { value: "other", label: "Autre" },
] as const;
