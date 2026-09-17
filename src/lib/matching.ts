export type EligibilityProfile = {
  date_of_birth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  education?: string | null;
  english_level?: string | null;
  financial_need?: boolean | null;
};

export type Bourse = {
  id: string;
  university_name: string;
  country: string;
  program_url?: string | null;
  eligible_nationalities: string[];
  gender_restriction: string;
  min_education?: string | null;
  max_age?: number | null;
  english_required: boolean;
  financial_need_required: boolean;
  window_opens?: string | null;
  window_closes?: string | null;
  window_confirmed?: boolean;
  academic_year?: number | null;
  notes?: string | null;
};

const EDUCATION_ORDER = ["bac", "licence", "master", "doctorat"];

export function getAge(dob?: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Les 7 critères d'éligibilité, tous requis (ET). */
export function profileMatchesBourse(profile: EligibilityProfile, bourse: Bourse): boolean {
  // 1. Nationalité
  if (
    bourse.eligible_nationalities.length > 0 &&
    (!profile.nationality || !bourse.eligible_nationalities.includes(profile.nationality))
  ) {
    return false;
  }

  // 2. Genre
  if (bourse.gender_restriction === "F" && profile.gender !== "F") return false;

  // 3. Niveau d'études minimum
  if (bourse.min_education) {
    const profileLevel = EDUCATION_ORDER.indexOf(profile.education ?? "");
    const requiredLevel = EDUCATION_ORDER.indexOf(bourse.min_education);
    if (profileLevel < requiredLevel) return false;
  }

  // 4. Âge maximum
  const age = getAge(profile.date_of_birth);
  if (bourse.max_age != null && age != null && age > bourse.max_age) return false;

  // 5. Anglais requis
  if (bourse.english_required && ["none", "basic"].includes(profile.english_level ?? "none")) {
    return false;
  }

  // 6. Besoin financier
  if (bourse.financial_need_required && !profile.financial_need) return false;

  // 7. Fenêtre ouverte, ou ouvrant dans les 60 prochains jours
  const now = new Date();
  const horizon = addDays(now, 60);
  if (!bourse.window_opens || new Date(bourse.window_opens) > horizon) return false;
  if (bourse.window_closes && new Date(bourse.window_closes) < now) return false;

  return true;
}

export function matchBourses(profile: EligibilityProfile, bourses: Bourse[]): Bourse[] {
  return bourses.filter((b) => profileMatchesBourse(profile, b));
}

export function formatDateFr(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
