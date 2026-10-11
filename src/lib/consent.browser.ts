/** Accord donné sur l'écran de connexion, transmis au premier écran connecté. */
const KEY = "kpb:consent";

export function savePendingConsent(whatsapp: boolean) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ whatsapp, at: Date.now() }));
  } catch {
    // Stockage indisponible : l'accord sera redemandé après la connexion
  }
}

export function readPendingConsent(): { whatsapp: boolean } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { whatsapp?: unknown };
    return { whatsapp: value.whatsapp === true };
  } catch {
    return null;
  }
}

export function clearPendingConsent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // rien à faire
  }
}
