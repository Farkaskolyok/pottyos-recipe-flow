import { idbClear, idbGet, idbKeys, idbPut, saveFileBlob, STORES, type StoredFile } from "./idb";
import { saveDownload } from "./platform";

/*
 * LOCAL BACKUP / RESTORE — one structured file saved on this device. No cloud, no network.
 * Contains: product data, rules, dictionary, categories, audit, settings, original source files
 * and the stored master template versions.
 */
export const BACKUP_FORMAT = "recipeflow-backup";
export const BACKUP_VERSION = 1;

interface BackupFile {
  id: string;
  name: string;
  type: string;
  savedAt: string;
  data: string; // base64
}
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  state: unknown;
  files: BackupFile[];
  templates: { id: string; version: string; savedAt: string; data: string }[];
}

const toB64 = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

export async function createBackup(state: unknown): Promise<Backup> {
  const files: BackupFile[] = [];
  for (const id of await idbKeys(STORES.files)) {
    const f = await idbGet<StoredFile>(STORES.files, id);
    if (!f) continue;
    files.push({
      id,
      name: f.name,
      type: f.type,
      savedAt: f.savedAt,
      data: toB64(await f.blob.arrayBuffer()),
    });
  }
  const templates: Backup["templates"] = [];
  for (const id of await idbKeys(STORES.templates)) {
    const t = await idbGet<{ version: string; savedAt: string; data: ArrayBuffer }>(
      STORES.templates,
      id,
    );
    if (t) templates.push({ id, version: t.version, savedAt: t.savedAt, data: toB64(t.data) });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    state,
    files,
    templates,
  };
}

export function parseBackup(text: string): Backup {
  const b = JSON.parse(text) as Backup;
  if (b?.format !== BACKUP_FORMAT || typeof b.version !== "number")
    throw new Error("Nem RecipeFlow biztonsági mentés.");
  if (b.version > BACKUP_VERSION)
    throw new Error("Újabb verziójú mentés – frissítse az alkalmazást.");
  const st = b.state as { products?: unknown; dictionary?: unknown } | null;
  if (!st || !Array.isArray(st.products) || !Array.isArray(st.dictionary))
    throw new Error("A mentés hiányos (termékek / szótár).");
  return b;
}

/** Replaces all local files and templates with the backup content. Returns the state to load. */
export async function restoreBackup(b: Backup) {
  await idbClear(STORES.files);
  for (const f of b.files)
    await saveFileBlob(f.id, new Blob([fromB64(f.data)], { type: f.type }), f.name);
  if (b.templates.length) {
    await idbClear(STORES.templates);
    for (const t of b.templates)
      await idbPut(STORES.templates, t.id, {
        version: t.version,
        savedAt: t.savedAt,
        data: fromB64(t.data),
      });
  }
  return b.state;
}

export function downloadBackup(b: Backup) {
  const blob = new Blob([JSON.stringify(b)], { type: "application/json" });
  return saveDownload(blob, `RecipeFlow_mentes_${b.createdAt.slice(0, 10)}.json`);
}
