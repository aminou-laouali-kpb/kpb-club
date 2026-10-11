/** File d'actions faites hors ligne, rejouées au retour du réseau. */
import { idb } from "./idb";

export type QueuedOp = {
  type: "item_status";
  itemId: string;
  status: "todo" | "in_progress" | "done" | "na";
};

export async function enqueue(op: QueuedOp) {
  // Une seule action par élément : la dernière l'emporte
  await idb.set("queue", `${op.type}:${op.itemId}`, { ...op, at: Date.now() });
}

export async function pendingCount() {
  return (await idb.all("queue")).length;
}

/** Rejoue les actions en attente ; celles qui échouent restent pour la prochaine fois. */
export async function replay(handlers: { item_status: (op: QueuedOp) => Promise<unknown> }) {
  const rows = await idb.all<QueuedOp & { at: number }>("queue");
  let done = 0;
  for (const [id, op] of rows) {
    try {
      await handlers[op.type](op);
      await idb.del("queue", id);
      done += 1;
    } catch {
      // Toujours hors ligne ou erreur serveur : on réessaiera
    }
  }
  return done;
}
