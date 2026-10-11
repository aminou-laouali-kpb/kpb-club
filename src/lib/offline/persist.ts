/**
 * Sauvegarde locale des données consultées (guide, modèles, candidatures, tableau de bord)
 * pour les relire sans réseau. Effacée à la déconnexion.
 */
import type { QueryClient } from "@tanstack/react-query";
import { idb } from "./idb";

const PERSISTED_PREFIXES = new Set([
  "member-overview",
  "applications",
  "application",
  "guide",
  "chapter",
  "templates",
  "template",
  "posts",
  "documents",
  "english",
]);
const MAX_AGE_MS = 30 * 86_400_000;

type Saved = { key: unknown[]; data: unknown; updatedAt: number };

export function isPersisted(key: readonly unknown[]) {
  return typeof key[0] === "string" && PERSISTED_PREFIXES.has(key[0]);
}

export async function restoreQueries(queryClient: QueryClient) {
  const rows = await idb.all<Saved>("queries");
  for (const [id, row] of rows) {
    if (!row || Date.now() - row.updatedAt > MAX_AGE_MS) {
      void idb.del("queries", id);
      continue;
    }
    // Ne pas écraser une donnée déjà rechargée depuis le réseau
    const existing = queryClient.getQueryState(row.key);
    if (!existing?.dataUpdatedAt || existing.dataUpdatedAt < row.updatedAt) {
      queryClient.setQueryData(row.key, row.data, { updatedAt: row.updatedAt });
    }
  }
}

export function persistQueries(queryClient: QueryClient) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const { queryKey, state } = event.query;
    if (!isPersisted(queryKey)) return;
    const id = JSON.stringify(queryKey);
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        void idb.set("queries", id, {
          key: queryKey,
          data: state.data,
          updatedAt: state.dataUpdatedAt,
        });
      }, 500),
    );
  });
}

export async function clearPersisted() {
  await Promise.all([idb.clear("queries"), idb.clear("queue")]);
}
