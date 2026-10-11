import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "saved" | "dirty" | "saving" | "offline" | "error";

type LocalDraft = { text: string; savedAt: string };

const DEBOUNCE_MS = 5_000;

function readLocal(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: LocalDraft | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Stockage indisponible (navigation privée) : la sauvegarde serveur reste active
  }
}

/**
 * Brouillon sauvegardé 5 s après la dernière frappe. Chaque frappe est aussi copiée
 * localement : une coupure réseau ou un rechargement ne perd rien, et l'envoi
 * reprend au retour du réseau.
 */
export function useAutosave(opts: {
  storageKey: string;
  serverText: string | null;
  serverSavedAt: string | null;
  save: (text: string, savedAt: string) => Promise<unknown>;
}) {
  const { storageKey, serverText, serverSavedAt, save } = opts;

  // La version la plus récente l'emporte : brouillon local non envoyé ou version serveur
  const [text, setText] = useState(() => {
    const local = typeof window === "undefined" ? null : readLocal(storageKey);
    if (local && (!serverSavedAt || local.savedAt > serverSavedAt)) return local.text;
    return serverText ?? "";
  });
  const [state, setState] = useState<AutosaveState>(() => {
    const local = typeof window === "undefined" ? null : readLocal(storageKey);
    return local && (!serverSavedAt || local.savedAt > serverSavedAt) ? "dirty" : "saved";
  });

  const pending = useRef<LocalDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const draft = pending.current ?? readLocal(storageKey);
    if (!draft) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState("offline");
      return;
    }
    setState("saving");
    try {
      await saveRef.current(draft.text, draft.savedAt);
      // On ne retire la copie locale que si rien n'a été tapé entre-temps
      if (pending.current?.savedAt === draft.savedAt || !pending.current) {
        pending.current = null;
        writeLocal(storageKey, null);
        setState("saved");
      } else {
        setState("dirty");
      }
    } catch {
      setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    }
  }, [storageKey]);

  const onChange = useCallback(
    (value: string) => {
      setText(value);
      const draft = { text: value, savedAt: new Date().toISOString() };
      pending.current = draft;
      writeLocal(storageKey, draft);
      setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush, storageKey],
  );

  useEffect(() => {
    // Brouillon local hérité d'une session précédente : on tente de l'envoyer
    if (state === "dirty" && !pending.current) void flush();
    const onOnline = () => void flush();
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
      // Départ de la page avant les 5 s : on envoie tout de suite
      if (pending.current) void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  return { text, onChange, state, flush };
}

export const AUTOSAVE_LABELS: Record<AutosaveState, string> = {
  saved: "Enregistré",
  dirty: "Modifications non enregistrées…",
  saving: "Enregistrement…",
  offline: "Hors ligne — sera envoyé au retour du réseau",
  error: "Échec de l'enregistrement — nouvel essai à la prochaine frappe",
};
