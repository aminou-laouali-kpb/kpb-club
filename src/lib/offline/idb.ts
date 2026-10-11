/** Petit accès à IndexedDB (clé → valeur), sans dépendance. Toutes les erreurs sont absorbées. */

const DB_NAME = "kpb-offline";
const STORES = ["queries", "queue"] as const;
type Store = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES)
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = fn(db.transaction(store, mode).objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export const idb = {
  get: <T>(store: Store, key: string) =>
    run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>),
  set: (store: Store, key: string, value: unknown) =>
    run(store, "readwrite", (s) => s.put(value, key)),
  del: (store: Store, key: string) => run(store, "readwrite", (s) => s.delete(key)),
  all: async <T>(store: Store) => {
    const [keys, values] = await Promise.all([
      run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()),
      run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
    ]);
    return (keys ?? []).map((k, i) => [String(k), (values ?? [])[i] as T] as const);
  },
  clear: (store: Store) => run(store, "readwrite", (s) => s.clear()),
};
