// Minimal IndexedDB wrapper. Everything stays on this device; no network is used.
const DB_NAME = "recipeflow";
const VERSION = 1;
export const STORES = { state: "state", files: "files" } as const;

let dbp: Promise<IDBDatabase> | null = null;

export function idbAvailable() {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORES.state)) db.createObjectStore(STORES.state);
        if (!db.objectStoreNames.contains(STORES.files)) db.createObjectStore(STORES.files);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => res(req.result as T);
        req.onerror = () => rej(req.error);
      }),
  );
}

export const idbGet = <T>(store: string, key: string) =>
  tx<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: string, key: string, value: unknown) =>
  tx<IDBValidKey>(store, "readwrite", (s) => s.put(value, key));
export const idbDelete = (store: string, key: string) =>
  tx<undefined>(store, "readwrite", (s) => s.delete(key));

export interface StoredFile {
  name: string;
  type: string;
  size: number;
  blob: Blob;
  savedAt: string;
}

export async function saveFileBlob(id: string, file: File | Blob, name: string) {
  if (!idbAvailable()) return;
  const rec: StoredFile = {
    name,
    type: file.type,
    size: file.size,
    blob: file,
    savedAt: new Date().toISOString(),
  };
  await idbPut(STORES.files, id, rec);
}
export async function loadFileBlob(id: string) {
  if (!idbAvailable()) return undefined;
  return idbGet<StoredFile>(STORES.files, id);
}

export async function storageEstimate(): Promise<{ usedMB: number; persisted: boolean } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usedMB: (e.usage ?? 0) / 1024 / 1024, persisted };
}
