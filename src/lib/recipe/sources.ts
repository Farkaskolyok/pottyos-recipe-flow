import { deleteFileBlob, loadFileBlob, saveFileBlob } from "@/lib/idb";
// Multi-file product package: recipe + supplier / raw material specifications + historical references.
// All extraction is deterministic and runs in the browser. No file content leaves the device.
import * as XLSX from "xlsx";
import type { NutrientKey, Product } from "./types";
import { NUTRIENT_LABELS } from "./types";
import { norm, uid } from "./format";

export type SourceType =
  | "RECIPE"
  | "SUPPLIER_SPECIFICATION"
  | "RAW_MATERIAL_SPECIFICATION"
  | "HISTORICAL_REFERENCE"
  | "COMPANY_MASTER"
  | "REGULATORY_SOURCE";

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  RECIPE: "Receptúra",
  SUPPLIER_SPECIFICATION: "Beszállítói specifikáció",
  RAW_MATERIAL_SPECIFICATION: "Alapanyag specifikáció",
  HISTORICAL_REFERENCE: "Korábbi referencia",
  COMPANY_MASTER: "Céges törzsadat",
  REGULATORY_SOURCE: "Jogszabályi forrás",
};

export type FileStatus = "ok" | "review" | "unreadable";
export type LinkState = "linked" | "suggested" | "rejected" | "none";
export type RegStatus =
  | "unverified"
  | "verified_local"
  | "verified_online"
  | "not_found"
  | "invalid";
export const REG_LABELS: Record<RegStatus, string> = {
  unverified: "Nem ellenőrzött",
  verified_local: "Ellenőrzött",
  verified_online: "Online ellenőrzött",
  not_found: "Nem található",
  invalid: "Hibás hivatkozás",
};
/** Maps statuses saved by earlier versions (ok/review) to the current ones. */
export function regStatus(r: { status: string }): RegStatus {
  if (r.status === "ok") return "verified_local";
  if (r.status === "review") return "unverified";
  return r.status as RegStatus;
}
export const regVerified = (r: { status: string }) => regStatus(r).startsWith("verified");
export const regBad = (r: { status: string }) => ["not_found", "invalid"].includes(regStatus(r));

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  num?: number;
  unit?: string;
  tolerance?: string;
  method?: string;
  page?: number;
  sheet?: string;
  cell?: string;
  original: string;
  /** set when the extracted value failed a sanity check or repeats with a different value */
  suspect?: string;
  /** output destinations */
  outputs?: ("sheet" | "spec" | "pack" | "internal")[];
}

export interface RegRef {
  id: string;
  identifier: string;
  page?: number;
  original: string;
  status: RegStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  /** manual | online | library */
  verificationMethod?: "manual" | "online" | "library";
  verificationSource?: string;
  sourceUrl?: string;
}

export interface UnknownItem {
  id: string;
  text: string;
  page?: number;
  decision?: {
    action: "field" | "newField" | "note" | "ignore";
    target?: string;
    by: string;
    at: string;
  };
}

export interface SourceFile {
  id: string;
  name: string;
  size: number;
  ext: string;
  sourceType: SourceType;
  status: FileStatus;
  warnings: string[];
  detectedMaterial?: string;
  fields: ExtractedField[];
  regulatory: RegRef[];
  unknown: UnknownItem[];
  linkRow?: number; // recipe ingredient row
  linkState: LinkState;
  linkScore?: number;
  /** Only partly readable (legacy .doc without local converter) – requires manual review. */
  partial?: boolean;
  demo?: boolean;
  /** Explicit demo marker (mirrors `demo`) */
  isDemo?: boolean;
}

/* ---------------- persistent local file storage (IndexedDB, for "Forrás megnyitása") ---------------- */
const SESSION_FILES = new Map<string, File>();
export function sessionFile(id: string) {
  return SESSION_FILES.get(id);
}
/** Stores the original file on this device so it can be reopened after reload/restart. */
export async function persistSourceFile(id: string, file: File) {
  SESSION_FILES.set(id, file);
  try {
    await saveFileBlob(id, file, file.name);
  } catch {
    /* storage full or unavailable – file stays available for this session */
  }
}
/** Deletes a stored original (file removed before processing, or product deleted). */
export async function deleteSourceFile(id: string) {
  SESSION_FILES.delete(id);
  await deleteFileBlob(id).catch(() => {});
}
/** Storage key of the product's main recipe XLS/XLSX. */
export const recipeFileId = (productId: string) => `recipe:${productId}`;
/** All stored blob ids belonging to a product (recipe + specifications + references). */
export function productFileIds(p: { id: string; files?: { id: string }[] }) {
  return [recipeFileId(p.id), ...(p.files ?? []).map((f) => f.id)];
}
export async function getSourceBlob(fileId: string): Promise<{ blob: Blob; name: string } | null> {
  const f = SESSION_FILES.get(fileId);
  if (f) return { blob: f, name: f.name };
  const rec = await loadFileBlob(fileId).catch(() => undefined);
  return rec ? { blob: rec.blob, name: rec.name } : null;
}
/** Fictional demo specifications have no real file: store a small local text original so "Forrás megnyitása" works. */
export async function ensureDemoSourceBlobs(files: SourceFile[]) {
  for (const f of files) {
    if (!f.demo) continue;
    const have = await loadFileBlob(f.id).catch(() => undefined);
    if (have) continue;
    const lines = [
      `${f.name}`,
      "FIKTÍV DEMÓ SPECIFIKÁCIÓ – nem valós adat",
      "",
      ...f.fields.map((x) => `${x.page ? `[${x.page}. oldal] ` : ""}${x.label}: ${x.value}`),
    ];
    await saveFileBlob(
      f.id,
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
      f.name,
    ).catch(() => {});
  }
}
/** Opens the locally stored original. Returns false when it is not stored on this device. */
export async function openSource(fileId: string | undefined, page?: number): Promise<boolean> {
  if (!fileId) return false;
  const win = window.open("", "_blank");
  const got = await getSourceBlob(fileId);
  if (!got) {
    win?.close();
    return false;
  }
  const url =
    URL.createObjectURL(got.blob) + (page && /\.pdf$/i.test(got.name) ? `#page=${page}` : "");
  if (win) win.location.href = url;
  else window.open(url, "_blank");
  return true;
}

/* ---------------- local regulatory library ---------------- */
export const REGULATORY_LIBRARY: Record<
  string,
  { title: string; status: RegStatus; reviewedAt: string }
> = {
  "1169/2011/EU": {
    title: "Fogyasztók élelmiszer-információval való ellátása",
    status: "verified_local",
    reviewedAt: "2026-01-15",
  },
  "1935/2004/EK": {
    title: "Élelmiszerrel érintkezésbe kerülő anyagok",
    status: "verified_local",
    reviewedAt: "2026-01-15",
  },
};

export function normRegId(s: string) {
  return s
    .replace(/\s/g, "")
    .replace(/\/(EC|CE)$/i, "/EK")
    .replace(/\/(EEC|EGK)$/i, "/EGK")
    .replace(/\/eu$/i, "/EU");
}

/* ---------------- text extraction (local) ---------------- */
interface Block {
  text: string;
  page?: number;
  sheet?: string;
  cell?: string;
}

async function pdfBlocks(buf: ArrayBuffer): Promise<Block[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const out: Block[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    for (const it of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = it.transform?.[5] ?? 0;
      if (lastY != null && Math.abs(y - lastY) > 2 && line.trim()) {
        out.push({ text: line.trim(), page: i });
        line = "";
      }
      line += (line && !line.endsWith(" ") ? " " : "") + it.str;
      lastY = y;
      if (it.hasEOL && line.trim()) {
        out.push({ text: line.trim(), page: i });
        line = "";
        lastY = null;
      }
    }
    if (line.trim()) out.push({ text: line.trim(), page: i });
  }
  return out;
}

async function docxBlocks(buf: ArrayBuffer): Promise<Block[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const out: Block[] = [];
  let page = 1;
  for (const p of xml.split(/<\/w:p>/)) {
    if (/w:type="page"|lastRenderedPageBreak/.test(p)) page++;
    const t = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)]
      .map((m) => (m[1] === undefined ? "\t" : m[1]))
      .join("");
    const text = t
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
    if (text) out.push({ text, page });
  }
  return out;
}

export const LEGACY_DOC_WARNING = "! Régi Word formátum – ellenőrzés szükséges";

/**
 * Local .doc → .docx conversion component for the offline installed version.
 * The installer runs a converter on this machine only (e.g. headless LibreOffice wrapped in a tiny
 * HTTP service on 127.0.0.1). No cloud conversion is ever used. Contract:
 *   POST {url}/convert  body: raw .doc bytes  →  200 with .docx bytes
 * The URL can be changed via localStorage key "rf.docConverterUrl". If unreachable, returns null.
 */
export async function convertLegacyDocLocally(buf: ArrayBuffer): Promise<ArrayBuffer | null> {
  if (typeof window === "undefined") return null;
  const base = localStorage.getItem("rf.docConverterUrl") || "http://127.0.0.1:8765";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(base)) return null; // local only
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(`${base}/convert`, {
      method: "POST",
      body: buf,
      signal: ctl.signal,
      headers: { "Content-Type": "application/msword" },
    });
    if (!r.ok) return null;
    const out = await r.arrayBuffer();
    return new Uint8Array(out.slice(0, 2)).join() === "80,75" ? out : null; // ZIP signature
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Legacy binary .doc fallback: best-effort local text scan. Never treated as validated data. */
function legacyDocBlocks(buf: ArrayBuffer): Block[] {
  const bytes = new Uint8Array(buf);
  // Word 97 stores text mostly as 8-bit or UTF-16LE; read both and keep readable runs.
  const runs: string[] = [];
  let cur = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b < 127) || b >= 0xc0 || b === 9) cur += String.fromCharCode(b);
    else if (b === 13 || b === 10) {
      if (cur.trim().length > 3) runs.push(cur.trim());
      cur = "";
    } else if (b !== 0) {
      if (cur.trim().length > 3) runs.push(cur.trim());
      cur = "";
    }
  }
  return runs.filter((r) => /[a-zA-Z]{3}/.test(r)).map((text) => ({ text }));
}

function sheetBlocks(buf: ArrayBuffer): Block[] {
  const wb = XLSX.read(buf, { type: "array" });
  const out: Block[] = [];
  for (const s of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[s], {
      header: 1,
      raw: false,
      defval: "",
    }) as string[][];
    grid.forEach((row, r) => {
      const cells = row.map((c) => String(c ?? "").trim());
      const first = cells.findIndex(Boolean);
      if (first < 0) return;
      out.push({
        text: cells.filter(Boolean).join(": "),
        sheet: s,
        cell: `${XLSX.utils.encode_col(first)}${r + 1}`,
      });
    });
  }
  return out;
}

/* ---------------- deterministic field recognition ---------------- */
const FIELD_LABELS: {
  key: string;
  label: string;
  aliases: string[];
  outputs: ExtractedField["outputs"];
}[] = [
  {
    key: "product_description",
    label: "Termékmegnevezés",
    aliases: [
      "product name",
      "product description",
      "termek neve",
      "termeknev",
      "megnevezes",
      "trade name",
      "kereskedelmi nev",
    ],
    outputs: ["internal"],
  },
  {
    key: "supplier",
    label: "Beszállító",
    aliases: ["supplier", "beszallito", "szallito"],
    outputs: ["internal"],
  },
  {
    key: "manufacturer",
    label: "Gyártó",
    aliases: ["manufacturer", "producer", "gyarto", "eloallito"],
    outputs: ["internal"],
  },
  { key: "address", label: "Cím", aliases: ["address", "cim"], outputs: ["internal"] },
  {
    key: "telephone",
    label: "Telefon",
    aliases: ["telephone", "phone", "tel", "telefon"],
    outputs: ["internal"],
  },
  { key: "email", label: "E-mail", aliases: ["email", "e mail"], outputs: ["internal"] },
  {
    key: "contact",
    label: "Kapcsolattartó",
    aliases: ["contact person", "contact", "kapcsolattarto"],
    outputs: ["internal"],
  },
  {
    key: "origin",
    label: "Származási hely",
    aliases: ["country of origin", "origin", "szarmazasi hely", "szarmazas"],
    outputs: ["spec"],
  },
  {
    key: "recommended_use",
    label: "Javasolt felhasználás",
    aliases: ["recommended use", "intended use", "felhasznalas"],
    outputs: ["internal"],
  },
  {
    key: "composition",
    label: "Összetétel",
    aliases: ["ingredients", "composition", "osszetetel", "osszetevok"],
    outputs: ["sheet", "spec"],
  },
  {
    key: "allergens",
    label: "Allergének",
    aliases: ["allergens", "allergen", "allergenek"],
    outputs: ["sheet", "spec", "pack"],
  },
  {
    key: "primary_packaging",
    label: "Elsődleges csomagolás",
    aliases: ["primary packaging", "elsodleges csomagolas"],
    outputs: ["spec"],
  },
  {
    key: "secondary_packaging",
    label: "Másodlagos csomagolás",
    aliases: ["secondary packaging", "masodlagos csomagolas"],
    outputs: ["spec"],
  },
  {
    key: "transport_packaging",
    label: "Szállítási csomagolás",
    aliases: ["transport packaging", "szallitasi csomagolas"],
    outputs: ["spec"],
  },
  {
    key: "packaging",
    label: "Csomagolás",
    aliases: ["packaging", "csomagolas"],
    outputs: ["spec"],
  },
  {
    key: "storage_conditions",
    label: "Tárolási feltételek",
    aliases: [
      "storage conditions",
      "storage",
      "tarolasi feltetelek",
      "tarolasi homerseklet",
      "raktarozasi homerseklet",
      "tarolas",
    ],
    outputs: ["sheet", "spec"],
  },
  {
    key: "transport_conditions",
    label: "Szállítási feltételek",
    aliases: ["transport conditions", "transport", "szallitasi feltetelek", "szallitas"],
    outputs: ["sheet", "spec"],
  },
  {
    key: "shelf_life",
    label: "Minőségmegőrzési idő",
    aliases: [
      "best before time",
      "best before",
      "shelf life",
      "minosegmegorzesi ido",
      "eltarthatosag",
      "minosegmegorzes",
    ],
    outputs: ["sheet", "spec"],
  },
];

const NUTRIENT_ALIASES: [NutrientKey, string[]][] = [
  [
    "saturates",
    ["of which saturates", "saturated fat", "saturates", "telitett zsirsav", "ebbol telitett"],
  ],
  ["sugars", ["of which sugars", "sugars", "ebbol cukrok", "cukrok"]],
  ["energyKj", ["energy kj", "energia kj"]],
  ["fat", ["fat", "zsir"]],
  ["carbohydrate", ["carbohydrate", "szenhidrat"]],
  ["fibre", ["dietary fibre", "fibre", "fiber", "rost"]],
  ["protein", ["protein", "feherje"]],
  ["salt", ["salt", "so"]],
];

const QUALITY_ALIASES: { key: string; label: string; unit: string; aliases: string[] }[] = [
  { key: "q.ph", label: "pH", unit: "", aliases: ["ph"] },
  {
    key: "q.brix",
    label: "Oldható szárazanyag",
    unit: "°Bx",
    aliases: ["soluble solids", "brix", "oldhato szarazanyag"],
  },
  {
    key: "q.density",
    label: "Sűrűség",
    unit: "kg/dm3",
    aliases: ["density", "consistency", "suruseg"],
  },
  { key: "q.moisture", label: "Nedvességtartalom", unit: "%", aliases: ["moisture", "nedvesseg"] },
  {
    key: "q.tpc",
    label: "Összes csíraszám",
    unit: "CFU/g",
    aliases: ["total plate count", "tpc", "osszes csiraszam"],
  },
  {
    key: "q.yeast",
    label: "Élesztő és penész",
    unit: "CFU/g",
    aliases: ["yeasts and moulds", "yeast and mould", "yeast and mold", "yeast", "eleszto"],
  },
  {
    key: "q.salmonella",
    label: "Salmonella",
    unit: "/25 g",
    aliases: ["salmonella"],
  },
  { key: "q.ecoli", label: "E. coli", unit: "CFU/g", aliases: ["e coli", "escherichia coli"] },
  {
    key: "q.saureus",
    label: "S. aureus",
    unit: "CFU/g",
    aliases: ["s aureus", "staphylococcus aureus", "koagulaz pozitiv staphylococcus"],
  },
];
const MICRO = new Set(["q.tpc", "q.yeast", "q.salmonella", "q.ecoli", "q.saureus"]);

/* ---------- source text noise: stored as source info, never a user task ---------- */
const STD_REF =
  /\b(?:MSZ|EN|ISO|DIN|AOAC|NMKL|IDF|BS|ASTM)(?:\s*(?:EN|ISO|IDF|TS))*\s*\d+(?:[-/.]\d+)*(?::\s?\d{4})?(?:\/[A-Z]\d+:\d{4})?/gi;
const NOISE: RegExp[] = [
  /^(?:oldal(?:szám)?|page|lap)\b/i,
  /\b(?:oldalszám|page)\s*:?\s*\d+\s*(?:\/|of|-)\s*\d+/i,
  /^\s*\d+\s*(?:\/|of)\s*\d+\s*$/i,
  /^(?:version|verzió|verzio|revision|revízió|rev\.?|kiadás|issue|edition)\b/i,
  /^(?:date|dátum|datum|kelt|issued|valid from|érvényes|prepared|készítette|approved|jóváhagyta|document|dokumentum|doc\.? ?no|form|nyomtatvány|author|szerző)\b/i,
  /\bdefinition\b|\bdefiníció|\bdefinicio|\bbelongs to\b|\baccording to\b|\bértelmében\b/i,
  /^(?:us|eu|ec|eк)\s+(?:dietary|sugars|fibre|fiber)/i,
  /^(?:table of contents|tartalom|contents|header|footer|confidential|bizalmas)\b/i,
];
export function isNoiseText(t: string) {
  const x = t.trim();
  if (x.length < 4) return true;
  if (NOISE.some((r) => r.test(x))) return true;
  // standard identifiers only (e.g. "MSZ EN ISO 6579:2006")
  if (!x.replace(STD_REF, "").replace(/[\s:;,.\-–/()]/g, "")) return true;
  const lv = x.match(/^([^:]{2,60}):\s*(.*)$/);
  // label with no usable value, or a value that is only a standard / version / page reference
  if (lv && !lv[2].replace(STD_REF, "").replace(/[\s\-–—/.:0]/g, "").length) return true;
  return false;
}

/** Parses a measured value / limit that is clearly connected to the parameter. */
export function parseQualityValue(key: string, raw: string) {
  const method = raw.match(STD_REF)?.map((m) => m.trim()).join(", ");
  const methodWord = raw.match(/(?:method|módszer|mérés)\s*:?\s*([^;,]+)/i)?.[1]?.trim();
  let rest = raw
    .replace(/(?:method|módszer|mérés)\s*:?\s*[^;,]+/gi, " ")
    .replace(STD_REF, " ")
    .replace(/\b(?:19|20)\d{2}\b(?![.,]\d)/g, " ") // bare years
    .replace(/\/\s*\d+\s*g\b/gi, " ") // "/25 g" sample size
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, " "); // dates
  rest = rest.replace(/\s+/g, " ").trim();
  if (MICRO.has(key)) {
    if (/negat|absent|nem kimutat|not detected|nd\b|hiány|nincs/i.test(rest))
      return { value: key === "q.salmonella" ? "0" : "nem kimutatható", num: 0, method: method ?? methodWord };
  }
  const OP = "(?:[=<>≤≥]|max\\.?|min\\.?|maximum|minimum|legfeljebb|legalább)";
  const NUMS = "(-?\\d+(?:[.,]\\d+)?(?:\\s?[x×]\\s?10\\^?\\d+)?)";
  const tries = [
    new RegExp(`^(${OP}\\s*)?${NUMS}(\\s*[-–]\\s*${NUMS})?`, "i"),
    new RegExp(`(${OP}\\s*)${NUMS}(\\s*[-–]\\s*${NUMS})?`, "i"),
    new RegExp(`${NUMS}\\s*[-–]\\s*${NUMS}`),
    MICRO.has(key) ? new RegExp(`${NUMS}\\s*(?:cfu|tke|kfu)`, "i") : null,
    /%|°\s?bx|kg\s?\/\s?dm/i.test(rest) ? new RegExp(`${NUMS}\\s*(?:%|°\\s?bx|kg)`, "i") : null,
  ].filter(Boolean) as RegExp[];
  let m: RegExpMatchArray | null = null;
  for (const r of tries) if ((m = rest.match(r))) break;
  if (!m) return null;
  const txt = m[0].trim().replace(/\s+/g, " ");
  const first = txt.match(/-?\d+(?:[.,]\d+)?/)![0];
  const num = toN(first);
  let suspect: string | undefined;
  if (key === "q.ph" && (num < 0 || num > 14)) suspect = "pH érték 0–14 tartományon kívül";
  if (key === "q.moisture" && (num < 0 || num > 100)) suspect = "Százalék 0–100% tartományon kívül";
  if (MICRO.has(key) && num >= 1900 && num <= 2100 && !/cfu|tke|kfu|[<>≤≥]/i.test(txt))
    suspect = "Évszámnak tűnő érték";
  return { value: txt.replace(".", ","), num, method: method ?? methodWord, suspect };
}

const NUM = /(-?\d+(?:[.,]\d+)?)/;
const toN = (s: string) => Number(s.replace(",", "."));

function splitLabel(t: string): [string, string] | null {
  const m = t.match(/^\s*(?:\d+(?:\.\d+)*\.?\s+)?([^:\t]{2,60}?)\s*[:\t]\s*(.+)$/);
  return m ? [m[1], m[2].trim()] : null;
}

function startsWithAlias(h: string, aliases: string[]) {
  return aliases.find((a) => h === a || h.startsWith(a + " "));
}

export function extractFromBlocks(blocks: Block[]) {
  const fields: ExtractedField[] = [];
  const regulatory: RegRef[] = [];
  const unknown: UnknownItem[] = [];
  const seen = new Set<string>();
  const loc = (b: Block) => ({ page: b.page, sheet: b.sheet, cell: b.cell });

  for (const b of blocks) {
    // regulatory references
    for (const m of b.text.matchAll(
      /\b(\d{2,4}\s?\/\s?\d{4}\s?\/\s?(?:EU|EK|EC|EGK|EEC|CE))\b|\((?:EU|EK|EC)\)\s?(?:No\.?|sz\.)?\s?(\d{2,4}\/\d{4})/gi,
    )) {
      const idf = normRegId(m[1] ?? `${m[2]}/EU`);
      if (regulatory.some((r) => r.identifier === idf)) continue;
      const lib = REGULATORY_LIBRARY[idf];
      regulatory.push({
        id: uid(),
        identifier: idf,
        page: b.page,
        original: b.text.slice(0, 240),
        status: lib?.status ?? "unverified",
        reviewedAt: lib?.reviewedAt,
        verificationMethod: lib ? "library" : undefined,
      });
    }
    const h = norm(b.text.replace(/[:()]/g, " "));
    const lv = splitLabel(b.text);
    const lh = lv ? norm(lv[0]) : h;

    const q = QUALITY_ALIASES.find(
      (qa) => startsWithAlias(lh, qa.aliases) || startsWithAlias(h, qa.aliases),
    );
    if (q) {
      const rest = lv ? lv[1] : b.text.slice(b.text.toLowerCase().indexOf(q.aliases[0]!) + 1);
      const labelOnly = (lv ? lv[0] : b.text).replace(/^[^a-z]*[a-z. ]+/i, "");
      const pv = parseQualityValue(q.key, lv ? rest : b.text.replace(/^[^\d<>≤≥=]*?(?=[\d<>≤≥=]|max|min|neg|absent|nem)/i, ""));
      void labelOnly;
      if (pv) {
        const tol = rest.match(/(±\s?\d+(?:[.,]\d+)?\s?%?)/)?.[1]?.replace(/\s/g, "");
        const prev = fields.find((x) => x.key === q.key);
        if (prev) {
          // repeated header / section: identical → keep one; different → one conflict for review
          if (prev.value !== pv.value && !prev.suspect?.startsWith("Eltérő"))
            prev.suspect = `Eltérő ismételt érték: ${prev.value} / ${pv.value}`;
          continue;
        }
        fields.push({
          key: q.key,
          label: q.label,
          value: pv.value,
          num: pv.num,
          unit: q.unit,
          tolerance: tol,
          method: pv.method,
          suspect: pv.suspect,
          original: b.text,
          outputs: ["sheet", "spec"],
          ...loc(b),
        });
        continue;
      }
      if (lv) continue; // quality label without a usable value: source info only
    }
    const nu = NUTRIENT_ALIASES.find(([, al]) => startsWithAlias(lh, al) || startsWithAlias(h, al));
    if (nu && !seen.has(`n.${nu[0]}`)) {
      const rest = lv ? lv[1] : b.text.slice(b.text.search(NUM));
      const n = rest.match(NUM);
      if (n) {
        seen.add(`n.${nu[0]}`);
        fields.push({
          key: `n.${nu[0]}`,
          label: NUTRIENT_LABELS[nu[0]],
          value: n[1].replace(".", ","),
          num: toN(n[1]),
          unit: nu[0].startsWith("energy") ? "kJ" : "g/100 g",
          original: b.text,
          outputs: ["internal"],
          ...loc(b),
        });
        continue;
      }
    }
    if (lv) {
      const f = FIELD_LABELS.find((fl) => startsWithAlias(lh, fl.aliases));
      if (f && !seen.has(f.key)) {
        seen.add(f.key);
        fields.push({
          key: f.key,
          label: f.label,
          value: lv[1],
          original: b.text,
          outputs: f.outputs,
          ...loc(b),
        });
        continue;
      }
      if (f) continue; // repeated label
      const txt = b.text.slice(0, 300);
      const k = norm(txt);
      if (
        unknown.length < 25 &&
        lv[1].length > 2 &&
        !isNoiseText(b.text) &&
        !unknown.some((u) => norm(u.text) === k)
      )
        unknown.push({ id: uid(), text: txt, page: b.page });
    }
  }
  return { fields, regulatory, unknown };
}

export function detectSourceType(
  name: string,
  section: "recipe" | "spec" | "reference",
): SourceType {
  if (section === "recipe") return "RECIPE";
  if (section === "reference") return "HISTORICAL_REFERENCE";
  const n = norm(name);
  if (/supplier|beszallito|szallito/.test(n)) return "SUPPLIER_SPECIFICATION";
  return /spec|specifikacio|adatlap/.test(n)
    ? "SUPPLIER_SPECIFICATION"
    : "RAW_MATERIAL_SPECIFICATION";
}

export async function processFile(file: File, section: "spec" | "reference"): Promise<SourceFile> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const sf: SourceFile = {
    id: uid(),
    name: file.name,
    size: file.size,
    ext,
    sourceType: detectSourceType(file.name, section),
    status: "ok",
    warnings: [],
    fields: [],
    regulatory: [],
    unknown: [],
    linkState: "none",
  };
  await persistSourceFile(sf.id, file);
  try {
    const buf = await file.arrayBuffer();
    let blocks: Block[] = [];
    if (ext === "pdf") blocks = await pdfBlocks(buf);
    else if (ext === "docx") blocks = await docxBlocks(buf);
    else if (ext === "xls" || ext === "xlsx") blocks = sheetBlocks(buf);
    let legacyPartial = false;
    if (ext === "doc") {
      const converted = await convertLegacyDocLocally(buf);
      if (converted) {
        blocks = await docxBlocks(converted);
        sf.warnings.push("Régi Word (.doc) formátum – helyi konverterrel DOCX-re alakítva.");
      } else {
        blocks = legacyDocBlocks(buf);
        legacyPartial = true;
        sf.warnings.push(LEGACY_DOC_WARNING);
        sf.warnings.push(
          "A dokumentum csak részlegesen olvasható. A véglegesítés előtt ellenőrzés szükséges.",
        );
      }
    } else if (!(ext === "pdf" || ext === "docx" || ext === "xls" || ext === "xlsx"))
      throw new Error("unsupported");
    if (!blocks.length) {
      sf.status = "unreadable";
      sf.warnings.push(
        ext === "pdf"
          ? "Nem található szöveg (valószínűleg szkennelt PDF)."
          : "Nem található olvasható szöveg.",
      );
      return sf;
    }
    const x = extractFromBlocks(blocks);
    Object.assign(sf, x);
    sf.detectedMaterial = x.fields.find((f) => f.key === "product_description")?.value;
    // Best-effort byte scanning of legacy .doc can NEVER make the file validated.
    if (ext === "doc" && legacyPartial) {
      sf.status = "review";
      sf.partial = true;
    } else if (ext === "doc") sf.status = "review";
    if (x.fields.length < 2) {
      sf.status = "review";
      sf.warnings.push("Kevés adat azonosítható automatikusan.");
    }
  } catch {
    sf.status = "unreadable";
    sf.warnings.push("A fájl nem olvasható be.");
  }
  return sf;
}

/* ---------------- raw material linking ---------------- */
const STOP = new Set([
  "specification",
  "specifikacio",
  "spec",
  "demo",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "the",
  "and",
  "es",
  "powder",
  "ltd",
  "kft",
]);
function tokens(s: string) {
  return new Set(
    norm(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}
export function suggestLink(sf: SourceFile, ingredients: { row: number; name: string }[]) {
  const a = new Set([...tokens(sf.name), ...tokens(sf.detectedMaterial ?? "")]);
  let best = { row: -1, score: 0 };
  for (const i of ingredients) {
    const b = tokens(i.name);
    if (!b.size) continue;
    let hit = 0;
    for (const t of b)
      if (
        [...a].some(
          (x) =>
            x === t ||
            (t.length > 4 && (x.startsWith(t.slice(0, 5)) || t.startsWith(x.slice(0, 5)))),
        )
      )
        hit++;
    const score = hit / b.size;
    if (score > best.score) best = { row: i.row, score };
  }
  return best;
}

export function applyLinkSuggestions(
  files: SourceFile[],
  ingredients: { row: number; name: string }[],
) {
  return files.map((f) => {
    if (
      f.sourceType === "RECIPE" ||
      f.sourceType === "HISTORICAL_REFERENCE" ||
      f.linkState !== "none"
    )
      return f;
    const s = suggestLink(f, ingredients);
    if (s.score >= 0.99)
      return { ...f, linkRow: s.row, linkState: "linked" as const, linkScore: s.score };
    if (s.score >= 0.3)
      return { ...f, linkRow: s.row, linkState: "suggested" as const, linkScore: s.score };
    return f;
  });
}

/* ---------------- conflicts ---------------- */
export interface Conflict {
  id: string;
  row: number;
  ingredient: string;
  nutrient: NutrientKey;
  label: string;
  recipe: number;
  spec: number;
  file: SourceFile;
  field: ExtractedField;
  recipeCell?: string;
}

export function findConflicts(p: Product): Conflict[] {
  const out: Conflict[] = [];
  for (const f of p.files ?? []) {
    if (f.linkState !== "linked" || f.linkRow == null) continue;
    const ing = p.ingredients.find((i) => i.raw.row === f.linkRow);
    if (!ing) continue;
    for (const fld of f.fields) {
      if (!fld.key.startsWith("n.") || fld.num == null) continue;
      const k = fld.key.slice(2) as NutrientKey;
      const r = (ing.raw.nutrients as Record<string, number>)[k];
      if (r == null) continue;
      if (
        Math.abs(r - fld.num) > 0.005 &&
        Math.abs(r - fld.num) / Math.max(Math.abs(r), 0.01) > 0.02
      )
        out.push({
          id: `ing.${f.linkRow}.${k}`,
          row: f.linkRow,
          ingredient: ing.raw.name,
          nutrient: k,
          label: NUTRIENT_LABELS[k],
          recipe: r,
          spec: fld.num,
          file: f,
          field: fld,
          recipeCell: ing.raw.refs[k],
        });
    }
  }
  return out;
}

/* ---------------- demo package (fictional) ---------------- */
export function demoSpecFiles(): SourceFile[] {
  const f = (
    name: string,
    ext: string,
    type: SourceType,
    material: string,
    fields: Omit<ExtractedField, "original">[],
    reg: [string, number][],
    unknown: [string, number][] = [],
    status: FileStatus = "ok",
    warnings: string[] = [],
  ): SourceFile => ({
    id: uid(),
    name,
    size: 120_000 + name.length * 997,
    ext,
    sourceType: type,
    status,
    warnings,
    detectedMaterial: material,
    fields: (
      [
        {
          key: "product_description",
          label: "Termékmegnevezés",
          value: material,
          page: 1,
          outputs: ["internal"],
        },
      ] as Omit<ExtractedField, "original">[]
    )
      .concat(fields)
      .map((x) => ({
        ...x,
        original: `${x.label}: ${x.value}${x.unit ? " " + x.unit : ""}${x.tolerance ? " " + x.tolerance : ""}`,
      })),
    regulatory: reg.map(([idf, page]) => {
      const lib = REGULATORY_LIBRARY[idf];
      return {
        id: uid(),
        identifier: idf,
        page,
        original: `Megfelel a(z) ${idf} rendelet előírásainak.`,
        status: lib?.status ?? "unverified",
        reviewedAt: lib?.reviewedAt,
        verificationMethod: lib ? "library" : undefined,
      };
    }),
    unknown: unknown.map(([text, page]) => ({ id: uid(), text, page })),
    linkState: "none",
    demo: true,
    isDemo: true,
  });
  return [
    f(
      "Demo joghurtos fehér bevonó specifikáció.pdf",
      "pdf",
      "SUPPLIER_SPECIFICATION",
      "Joghurtos bevonómassza",
      [
        { key: "supplier", label: "Beszállító", value: "Demo Bevonó Kft. (fiktív)", page: 1 },
        {
          key: "origin",
          label: "Származási hely",
          value: "Magyarország",
          page: 1,
          outputs: ["spec"],
        },
        {
          key: "storage_conditions",
          label: "Tárolási feltételek",
          value: "15–20 °C, száraz helyen",
          page: 2,
          outputs: ["sheet", "spec"],
        },
        {
          key: "transport_conditions",
          label: "Szállítási feltételek",
          value: "max. 25 °C",
          page: 2,
          outputs: ["sheet", "spec"],
        },
        {
          key: "shelf_life",
          label: "Minőségmegőrzési idő",
          value: "12 hónap",
          page: 2,
          outputs: ["sheet", "spec"],
        },
        {
          key: "allergens",
          label: "Allergének",
          value: "tej",
          page: 2,
          outputs: ["sheet", "spec", "pack"],
        },
        { key: "n.fat", label: "Zsír", value: "34,5", num: 34.5, unit: "g/100 g", page: 3 },
        { key: "n.salt", label: "Só", value: "0,08", num: 0.08, unit: "g/100 g", page: 3 },
      ],
      [
        ["1169/2011/EU", 4],
        ["1935/2004/EK", 4],
      ],
    ),
    f(
      "Demo inulin HSI specification.pdf",
      "pdf",
      "RAW_MATERIAL_SPECIFICATION",
      "Inulin",
      [
        { key: "manufacturer", label: "Gyártó", value: "Demo Fibre Ltd. (fiktív)", page: 1 },
        { key: "origin", label: "Származási hely", value: "Belgium", page: 1, outputs: ["spec"] },
        {
          key: "storage_conditions",
          label: "Tárolási feltételek",
          value: "hűvös, száraz helyen, max. 25 °C",
          page: 1,
          outputs: ["sheet", "spec"],
        },
        {
          key: "q.moisture",
          label: "Nedvességtartalom",
          value: "4,5",
          num: 4.5,
          unit: "%",
          tolerance: "±0,5",
          method: "szárítószekrény",
          page: 2,
          outputs: ["sheet", "spec"],
        },
      ],
      [["1169/2011/EU", 3]],
    ),
    f(
      "Demo POWDER FLAVOUR specification.pdf",
      "pdf",
      "SUPPLIER_SPECIFICATION",
      "Natural raspberry powder flavour",
      [
        { key: "supplier", label: "Beszállító", value: "Demo Aroma Bt. (fiktív)", page: 1 },
        {
          key: "storage_conditions",
          label: "Tárolási feltételek",
          value: "10–20 °C, fénytől védve",
          page: 1,
          outputs: ["sheet", "spec"],
        },
        {
          key: "shelf_life",
          label: "Minőségmegőrzési idő",
          value: "18 hónap",
          page: 1,
          outputs: ["sheet", "spec"],
        },
      ],
      [
        ["1169/2011/EU", 2],
        ["1334/2008/EK", 2],
      ],
      [["Safety precautions: fine powder can cause dust explosion", 3]],
    ),
    f(
      "Demo RASPBERRY-muesli specification.doc",
      "doc",
      "RAW_MATERIAL_SPECIFICATION",
      "Málna-müzli",
      [
        { key: "supplier", label: "Beszállító", value: "Demo Müzli Zrt. (fiktív)", page: 1 },
        {
          key: "composition",
          label: "Összetétel",
          value: "zabpehely, liofilizált málna, cukor",
          page: 1,
          outputs: ["sheet", "spec"],
        },
        {
          key: "allergens",
          label: "Allergének",
          value: "zab (glutén)",
          page: 1,
          outputs: ["sheet", "spec", "pack"],
        },
        {
          key: "q.ph",
          label: "pH",
          value: "3,7",
          num: 3.7,
          unit: "",
          tolerance: "±0,3",
          method: "pH-mérő",
          page: 4,
          outputs: ["sheet", "spec"],
        },
        {
          key: "q.brix",
          label: "Oldható szárazanyag",
          value: "45,0",
          num: 45,
          unit: "°Bx",
          tolerance: "±2,0",
          method: "refraktométer",
          page: 4,
          outputs: ["sheet", "spec"],
        },
        {
          key: "q.density",
          label: "Sűrűség",
          value: "1,25",
          num: 1.25,
          unit: "kg/dm3",
          tolerance: "±3%",
          method: "számított érték",
          page: 4,
          outputs: ["sheet", "spec"],
        },
      ],
      [],
      [],
      "review",
      ["! Régi Word formátum – ellenőrzés szükséges"],
    ),
  ];
}

/* ---------------- online regulation check (identifier only) ---------------- */
export type OnlineRegResult =
  | { kind: "offline" }
  | { kind: "found"; celex: string; url: string; source: string }
  | { kind: "not_found"; source: string }
  | { kind: "invalid" };

/** Sends ONLY the normalized identifier (e.g. "1169/2011/EU"); no product data ever leaves the device. */
export async function verifyRegulationOnline(identifier: string): Promise<OnlineRegResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
  try {
    const r = await fetch(`/api/public/regulation?id=${encodeURIComponent(identifier)}`);
    if (r.status === 400) return { kind: "invalid" };
    if (!r.ok) return { kind: "offline" };
    return (await r.json()) as OnlineRegResult;
  } catch {
    return { kind: "offline" };
  }
}
