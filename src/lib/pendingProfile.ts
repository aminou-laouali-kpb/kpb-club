const KEY = "kpb_pending_profile";

export type PendingProfile = {
  full_name?: string;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  residence?: string | null;
  education?: string | null;
  field_of_study?: string | null;
  english_level?: string | null;
  financial_need?: boolean;
};

export function savePendingProfile(profile: PendingProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(profile));
}

export function readPendingProfile(): PendingProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingProfile;
  } catch {
    return null;
  }
}

export function consumePendingProfile(): PendingProfile | null {
  const value = readPendingProfile();
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  return value;
}
