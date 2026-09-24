// AI-assisted document understanding – FALLBACK layer only.
// Deterministic parsing, calculations, validation and Word generation stay unchanged.
// AI values are kept separately (origin "ai") and never overwrite source/manual values.
import type { Product } from "./types";
import type { Dataset, Destination, Settings } from "./engine";

export type AiStatus = "pending" | "accepted" | "review" | "suggestion" | "rejected";

export interface AiValue {
  fieldKey: string;
  value: string;
  sourceFile: string;
  fileId?: string;
  page?: number;
  sheet?: string;
  originalSourceText: string;
  confidence: number;
  timestamp: string;
  status: AiStatus;
  decidedBy?: string;
}

export interface AiSnippet {
  id: string;
  text: string;
  fileId: string;
  fileName: string;
  page?: number;
  sheet?: string;
  unknownId?: string;
}

export interface MappingStat {
  pattern: string;
  fieldKey: string;
  accepted: number;
  rejected: number;
  products: string[];
}

/** Master fields the AI may populate (never company/regulatory/calculated values). */
export const AI_TARGET_FIELDS: Record<string, string> = {
  marketingName: "Kereskedelmi név",
  description: "Termékleírás",
  legalName: "Jogszabályi megnevezés",
  sapCode: "SAP kód",
  taricCode: "TARIC kód",
  variant: "Ízváltozat",
  plantName: "Gyártó üzem",
  plantAddress: "Gyártó üzem címe",
  healthMark: "Egészségügyi jel",
  recommendedUse: "Ajánlott felhasználás",
  consumerGroup: "Ajánlott fogyasztói csoport",
  processDescription: "Gyártási folyamat, paraméterek",
  gmoStatement: "GMO nyilatkozat",
  packagingForm: "Csomagolás formája",
  packagingMaterial: "Csomagolóanyag típusa",
  secondaryPackaging: "Gyűjtő csomagolás",
  palletPackaging: "Raklap csomagolás",
  weightTolerance: "Tömeg tűrés",
  shelfLife: "Minőségmegőrzési időtartam",
  transport: "Szállítási feltételek",
  distributionConditions: "Forgalmazási feltételek",
  physical: "Fizikai jellemzők",
  chemical: "Kémiai jellemzők",
  micro: "Mikrobiológiai jellemzők",
  sensory: "Érzékszervi jellemzők (állomány, szín, íz, szag)",
  foodSafety: "Élelmiszerbiztonsági kritériumok",
  labelling: "Jelölés, gyártási azonosító",
  claims: "Állítások",
  mayContain: "Nyomokban tartalmazhat",
  servingsPerPack: "Adagok száma a csomagban",
  infoLine: "Info vonal",
  website: "Weboldal",
  barcode: "Vonalkód",
};

/** Always need confirmation, regardless of confidence. */
export const AI_CRITICAL = new Set([
  "sapCode",
  "taricCode",
  "barcode",
  "legalName",
  "healthMark",
  "gmoStatement",
  "claims",
  "mayContain",
]);

export const aiActive = (v?: AiValue) => !!v && (v.status === "accepted" || v.status === "review");

/** Confidence routing: ≥0.90 auto-fill, 0.70–0.89 fill as Ellenőrizendő, <0.70 suggestion only. */
export function classify(fieldKey: string, confidence: number): "auto" | "review" | "suggestion" {
  if (confidence < 0.7) return "suggestion";
  if (confidence >= 0.9 && !AI_CRITICAL.has(fieldKey)) return "auto";
  return "review";
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/** Minimum text sent to the AI: only short extracted lines, never whole files. */
export function collectSnippets(p: Product, max = 150): AiSnippet[] {
  const out: AiSnippet[] = [];
  const seen = new Set<string>();
  for (const f of p.files ?? []) {
    if (f.status === "unreadable") continue;
    const push = (text: string, extra: Partial<AiSnippet>) => {
      const t = text.replace(/\s+/g, " ").trim();
      const k = t.toLowerCase();
      if (t.length < 4 || seen.has(k) || out.length >= max) return;
      seen.add(k);
      out.push({
        id: `s${out.length + 1}`,
        text: clip(t, 400),
        fileId: f.id,
        fileName: f.name,
        ...extra,
      });
    };
    for (const u of f.unknown) if (!u.decision) push(u.text, { page: u.page, unknownId: u.id });
    for (const x of f.fields)
      if (!x.key.startsWith("n.") && x.original) push(x.original, { page: x.page, sheet: x.sheet });
  }
  return out;
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%°]+/g, " ")
    .trim();

/** Deterministic anti-hallucination guard: the value must be supported by the source text. */
export function supportedBySource(value: string, source: string) {
  const s = norm(source);
  const words = norm(value)
    .split(" ")
    .filter((w) => w.length > 1);
  if (!words.length) return false;
  const hit = words.filter((w) => s.includes(w)).length;
  return hit / words.length >= 0.6;
}

export interface AiRawResult {
  fieldKey: string;
  value: string | null;
  snippetId: string | null;
  confidence: number;
}

/** Stores AI results as pending (nothing is filled until the user applies them). */
export function storeAiResults(
  p: Product,
  results: AiRawResult[],
  noise: string[],
  snippets: AiSnippet[],
  missing: string[],
): { product: Product; notFound: string[] } {
  const byId = new Map(snippets.map((s) => [s.id, s]));
  const now = new Date().toISOString();
  const aiValues = { ...(p.aiValues ?? {}) };
  const found = new Set<string>();
  for (const r of results) {
    if (!AI_TARGET_FIELDS[r.fieldKey] || !missing.includes(r.fieldKey)) continue;
    const s = r.snippetId ? byId.get(r.snippetId) : undefined;
    const value = (r.value ?? "").trim();
    if (!s || !value || value.toUpperCase() === "NOT_FOUND") continue;
    const prev = aiValues[r.fieldKey];
    if (prev && (prev.status === "accepted" || prev.status === "rejected")) continue;
    let confidence = Math.max(0, Math.min(1, Number(r.confidence) || 0));
    if (!supportedBySource(value, s.text)) confidence = Math.min(confidence, 0.5);
    found.add(r.fieldKey);
    aiValues[r.fieldKey] = {
      fieldKey: r.fieldKey,
      value,
      sourceFile: s.fileName,
      fileId: s.fileId,
      page: s.page,
      sheet: s.sheet,
      originalSourceText: s.text,
      confidence,
      timestamp: now,
      status: "pending",
    };
  }
  // AI noise filter: hide irrelevant unknown items (logged, reversible via audit)
  const noiseUnk = new Set(noise.map((id) => byId.get(id)?.unknownId).filter(Boolean) as string[]);
  const files = (p.files ?? []).map((f) => ({
    ...f,
    unknown: f.unknown.map((u) =>
      !u.decision && noiseUnk.has(u.id)
        ? { ...u, decision: { action: "ignore" as const, by: "AI zajszűrő", at: now } }
        : u,
    ),
  }));
  return {
    product: { ...p, aiValues, files },
    notFound: missing.filter((k) => !found.has(k) && !p.aiValues?.[k]),
  };
}

export function aiSummary(p: Product, missing: string[]) {
  const vals = Object.values(p.aiValues ?? {}).filter((v) => v.status === "pending");
  const auto = vals.filter((v) => classify(v.fieldKey, v.confidence) === "auto").length;
  const review = vals.length - auto;
  const covered = new Set(Object.keys(p.aiValues ?? {}));
  const none = missing.filter((k) => !covered.has(k)).length;
  return { auto, review, none };
}

const markUnknown = (p: Product, v: AiValue, by: string) => {
  const t = norm(v.originalSourceText);
  return (p.files ?? []).map((f) =>
    f.id !== v.fileId
      ? f
      : {
          ...f,
          unknown: f.unknown.map((u) =>
            !u.decision && norm(u.text).startsWith(t.slice(0, 60))
              ? {
                  ...u,
                  decision: {
                    action: "field" as const,
                    target: v.fieldKey,
                    by,
                    at: new Date().toISOString(),
                  },
                }
              : u,
          ),
        },
  );
};

/** BIZTOS TALÁLATOK ALKALMAZÁSA: ≥0.90 → accepted, 0.70–0.89 / critical → filled as Ellenőrizendő. */
export function applyConfident(p: Product, by: string): Product {
  let next = { ...p, aiValues: { ...(p.aiValues ?? {}) } };
  for (const v of Object.values(next.aiValues)) {
    if (v.status !== "pending") continue;
    const c = classify(v.fieldKey, v.confidence);
    const nv: AiValue = {
      ...v,
      status: c === "auto" ? "accepted" : c === "review" ? "review" : "suggestion",
      decidedBy: c === "auto" ? by : undefined,
    };
    next.aiValues[v.fieldKey] = nv;
    if (c !== "suggestion") next = { ...next, files: markUnknown(next, nv, by) };
  }
  return next;
}

export function decideAi(p: Product, key: string, accept: boolean, by: string): Product {
  const v = p.aiValues?.[key];
  if (!v) return p;
  const nv: AiValue = { ...v, status: accept ? "accepted" : "rejected", decidedBy: by };
  const next = { ...p, aiValues: { ...(p.aiValues ?? {}), [key]: nv } };
  return accept ? { ...next, files: markUnknown(next, nv, by) } : next;
}

/* ---------- local mapping history → future deterministic rules ---------- */
export function patternOf(text: string) {
  const lv = text.match(/^([^:]{2,40}):/);
  const base = lv ? lv[1] : text.split(/\s+/).slice(0, 2).join(" ");
  return norm(base);
}

export function recordMapping(
  history: MappingStat[],
  v: AiValue,
  accepted: boolean,
  productId: string,
): MappingStat[] {
  const pattern = patternOf(v.originalSourceText);
  if (!pattern) return history;
  const i = history.findIndex((h) => h.pattern === pattern && h.fieldKey === v.fieldKey);
  const cur = i >= 0 ? history[i] : { pattern, fieldKey: v.fieldKey, accepted: 0, rejected: 0, products: [] };
  const upd: MappingStat = {
    ...cur,
    accepted: cur.accepted + (accepted ? 1 : 0),
    rejected: cur.rejected + (accepted ? 0 : 1),
    products: [...new Set([...cur.products, productId])],
  };
  return i >= 0 ? history.map((h, j) => (j === i ? upd : h)) : [...history, upd];
}

/** RULE CANDIDATE: accepted across ≥3 products and never rejected. Never auto-activated. */
export const ruleCandidates = (h: MappingStat[]) =>
  h.filter((m) => m.rejected === 0 && m.products.length >= 3 && m.accepted >= 3);

/* ---------- KIMENETI DOKUMENTUMOK TELJESSÉGE ---------- */
export const OUTPUT_FIELDS: Record<Destination, string[]> = {
  sheet: [
    "productName", "description", "preparedBy", "responsible", "approver", "effectiveDate",
    "manufacturer", "plantName", "plantAddress", "healthMark", "legalName", "ingredientText",
    "gmoStatement", "processDescription", "packagingForm", "packagingMaterial", "productWeight",
    "weightTolerance", "micro", "physical", "sensory", "shelfLife", "storage", "labelling",
  ],
  spec: [
    "productName", "sapCode", "taricCode", "plantName", "plantAddress", "description",
    "recommendedUse", "consumerGroup", "packagingMaterial", "secondaryPackaging",
    "palletPackaging", "storage", "transport", "shelfLife", "distributionConditions",
    "ingredientText", "productWeight", "weightTolerance", "acceptanceRange", "micro", "sensory",
    "preparedBy", "effectiveDate",
  ],
  pack: [
    "marketingName", "variant", "servingSize", "legalName", "productWeight", "ingredientText",
    "mayContain", "claims", "servingsPerPack", "storage", "manufacturer", "healthMark",
    "plantAddress", "infoLine", "website", "barcode",
  ],
};

export type Fill = "filled" | "review" | "missing";

export function completeness(ds: Dataset) {
  const keys = [...new Set(Object.values(OUTPUT_FIELDS).flat())];
  const state = (k: string): Fill => {
    if (k === "ingredientText") return ds.ingredientText ? "filled" : "missing";
    const v = ds.basics[k];
    if (!v || !v.display.trim()) return "missing";
    if (v.origin === "ai" && v.ai?.status === "review") return "review";
    return "filled";
  };
  const items = keys.map((k) => ({
    key: k,
    label: k === "ingredientText" ? "Összetevők" : (ds.basics[k]?.label ?? k),
    state: state(k),
    docs: (Object.keys(OUTPUT_FIELDS) as Destination[]).filter((d) => OUTPUT_FIELDS[d].includes(k)),
  }));
  const c = (s: Fill) => items.filter((i) => i.state === s).length;
  const filled = c("filled");
  return {
    items,
    filled,
    review: c("review"),
    missing: c("missing"),
    pct: Math.round((filled / items.length) * 100),
  };
}

export const aiEnabled = (s: Settings) => s.aiEnabled === true;
