import { useEffect } from "react";

const KEY = "kpb:ref";
const MAX_AGE_MS = 30 * 86_400_000;

/** Mémorise le code de parrainage d'un lien `?ref=` pendant 30 jours. */
export function useReferralCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[A-Za-z0-9-]{6,12}$/.test(ref)) {
        localStorage.setItem(KEY, JSON.stringify({ code: ref, at: Date.now() }));
      }
    } catch {
      // Stockage indisponible : le parrainage ne sera simplement pas attribué
    }
  }, []);
}

export function readCapturedReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (Date.now() - at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function clearCapturedReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à faire
  }
}

/** Une fois connecté : rattache le compte au parrain capturé, puis oublie le code. */
export function useAttachCapturedReferral(attach: (code: string) => Promise<unknown>) {
  useEffect(() => {
    const code = readCapturedReferral();
    if (!code) return;
    attach(code)
      .then(() => clearCapturedReferral())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
