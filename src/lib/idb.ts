// Minimal IndexedDB wrapper. Everything stays on this device; no network is used.
const DB_NAME = "recipeflow";
const VERSION = 2;
export const STORES = { state: "state", files: "files", templates: "templates" } as const;

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
        for (const s of Object.values(STORES))
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
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
export const idbKeys = (store: string) =>
  tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()).then((k) => k.map(String));
export const idbClear = (store: string) => tx<undefined>(store, "readwrite", (s) => s.clear());

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
export async function deleteFileBlob(id: string) {
  if (!idbAvailable()) return;
  await idbDelete(STORES.files, id);
}
export async function listFileIds() {
  if (!idbAvailable()) return [] as string[];
  return idbKeys(STORES.files);
}
/** Removes every stored original that is no longer referenced by any product. */
export async function purgeOrphanFiles(keep: Set<string>) {
  const ids = await listFileIds();
  const gone = ids.filter((id) => !keep.has(id));
  for (const id of gone) await deleteFileBlob(id);
  return gone;
}

export interface StorageStatus {
  usedMB: number;
  persisted: boolean;
}
export async function storageEstimate(): Promise<StorageStatus | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usedMB: (e.usage ?? 0) / 1024 / 1024, persisted };
}
