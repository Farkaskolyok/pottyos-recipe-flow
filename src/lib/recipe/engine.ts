import type {
  Check,
  DictionaryEntry,
  NutrientKey,
  Product,
  RawRecipe,
  ResolvedIngredient,
  TracedValue,
} from "./types";
import { NUTRIENTS, NUTRIENT_LABELS } from "./types";
import { matchIngredient } from "./dictionary";
import { roundNutrient, ruleLabel } from "./rules";
import { huNumber } from "./format";
import { findConflicts } from "./sources";

export type AllergenFormat = "bold" | "uppercase" | "bold-uppercase";
export type Destination = "sheet" | "spec" | "pack";

export interface Settings {
  allergenFormat: AllergenFormat;
  manufacturer: string;
  distributor: string;
  storage: string;
  userName: string;
  companyDefaults: { acceptanceRange: string; legalText: string };
  visibility: Record<string, Destination[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  allergenFormat: "bold-uppercase",
  manufacturer: "Demo Gyártó Kft., 0000 Mintaváros, Minta utca 1.",
  distributor: "",
  storage: "+2 °C és +6 °C között tárolandó.",
  userName: "Demo felhasználó",
  companyDefaults: {
    acceptanceRange: "2%",
    legalText: "A tápérték-jelölés az 1169/2011/EU rendelet szerint készült.",
  },
  visibility: {
    productName: ["sheet", "spec", "pack"],
    marketingName: ["spec", "pack"],
    productWeight: ["sheet", "spec", "pack"],
    servingSize: ["sheet", "spec"],
    packaging: ["sheet", "spec"],
    losses: ["sheet"],
    totalSolids: ["sheet", "spec"],
    ingredientCodes: ["sheet"],
    nutritionServing: ["spec", "pack"],
  },
};

export const VISIBILITY_LABELS: Record<string, string> = {
  productName: "Terméknév",
  marketingName: "Marketing megnevezés",
  productWeight: "Nettó tömeg",
  servingSize: "Adagméret",
  packaging: "Csomagolási adatok",
  losses: "Gyártási veszteség",
  totalSolids: "Szárazanyag",
  ingredientCodes: "Anyagkódok, mennyiségek",
  nutritionServing: "Tápérték / termék",
};

export function resolveIngredients(raw: RawRecipe, dict: DictionaryEntry[]): ResolvedIngredient[] {
  const total = raw.ingredients.reduce((s, i) => s + (i.quantity ?? 0), 0) || 1;
  return raw.ingredients.map((r) => {
    const m = matchIngredient(r.name, r.code, dict);
    return {
      raw: r,
      status: m.status,
      entryId: m.entryId,
      percentage: ((r.quantity ?? 0) / total) * 100,
    };
  });
}

function toNum(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(
    String(v)
      .replace(",", ".")
      .replace(/[^0-9.-]/g, ""),
  );
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
}

export interface NutritionRow {
  key: NutrientKey;
  per100: TracedValue;
  perServing: TracedValue | null;
}

export interface Segment {
  text: string;
  emph?: boolean;
}

export interface Dataset {
  basics: Record<string, TracedValue>;
  nutrition: NutritionRow[];
  ingredientSegments: Segment[];
  ingredientText: string;
  ingredientTextManual: boolean;
  allergens: string[];
  checks: Check[];
  counts: { ok: number; warn: number; error: number };
  totalQty: number;
  weightG: number | null;
}

export function buildDataset(p: Product, dict: DictionaryEntry[], settings: Settings): Dataset {
  const src = (cell: string) => ({ file: p.raw.fileName, sheet: p.raw.sheet, cell });
  const basics: Record<string, TracedValue> = {};

  const metaVal = (key: string, label: string, unit?: string) => {
    const m = p.raw.meta[key];
    const ov = p.overrides[key];
    if (ov) {
      basics[key] = {
        label,
        original: m?.value ?? null,
        calculated: m?.value ?? null,
        display: ov.value,
        unit,
        origin: "manual",
        manual: ov,
        source: m ? src(m.cell) : undefined,
      };
    } else if (m) {
      const n = unit ? toNum(m.value) : null;
      basics[key] = {
        label,
        original: m.value,
        calculated: n ?? m.value,
        display: n != null && unit ? `${huNumber(n, n % 1 ? 1 : 0)} ${unit}` : String(m.value),
        unit,
        origin: "source",
        source: src(m.cell),
      };
    } else {
      basics[key] = {
        label,
        original: null,
        calculated: null,
        display: "",
        unit,
        origin: "source",
      };
    }
  };
  metaVal("productName", "Terméknév");
  metaVal("recipeVersion", "Receptverzió");
  metaVal("productWeight", "Nettó tömeg", "g");
  metaVal("servingSize", "Adagméret", "g");
  metaVal("packaging", "Csomagolás");
  metaVal("losses", "Gyártási veszteség", "%");

  const manualOnly = (key: string, label: string, def: string) => {
    const ov = p.overrides[key];
    basics[key] = ov
      ? {
          label,
          original: def || null,
          calculated: def || null,
          display: ov.value,
          origin: "manual",
          manual: ov,
        }
      : {
          label,
          original: null,
          calculated: def || null,
          display: def,
          origin: "calculated",
          rule: def ? "Beállítások alapértéke" : undefined,
        };
  };
  manualOnly("marketingName", "Marketing megnevezés", "");
  manualOnly("description", "Termékleírás", "");
  manualOnly("storage", "Tárolás", settings.storage);
  manualOnly("manufacturer", "Gyártó", settings.manufacturer);
  manualOnly("distributor", "Forgalmazó", settings.distributor);
  const cd = settings.companyDefaults ?? DEFAULT_SETTINGS.companyDefaults;
  manualOnly("acceptanceRange", "Elfogadhatósági tartomány", cd.acceptanceRange);
  manualOnly("texture", "Állag", "Krémes");
  manualOnly("storageMode", "Tárolási mód", "Hűtve tárolandó");
  manualOnly("bestBeforeWording", "Minőségmegőrzési megfogalmazás", "Minőségét megőrzi:");
  manualOnly("legalText", "Jogszabályi szöveg", cd.legalText);
  // master-template fields (values always come from the current product; empty until provided)
  for (const [k, l, d] of [
    ["sapCode", "Azonosítószám (SAP)", ""],
    ["taricCode", "TARIC kód", ""],
    ["variant", "Ízváltozat", ""],
    ["legalName", "Jogszabályi megnevezés", ""],
    ["plantName", "Gyártó üzem", ""],
    ["plantAddress", "Gyártó üzem címe", ""],
    ["healthMark", "Egészségügyi jel", ""],
    ["recommendedUse", "Ajánlott felhasználás", ""],
    ["consumerGroup", "Ajánlott fogyasztói csoport", ""],
    ["processDescription", "Gyártási folyamat, paraméterek", ""],
    ["gmoStatement", "GMO nyilatkozat", ""],
    ["packagingForm", "Csomagolás formája", ""],
    ["packagingMaterial", "Csomagolóanyag típusa", ""],
    ["secondaryPackaging", "Gyűjtő csomagolás", ""],
    ["palletPackaging", "Raklap csomagolás", ""],
    ["weightTolerance", "Tömeg tűrés", ""],
    ["shelfLife", "Minőségmegőrzési időtartam", ""],
    ["transport", "Szállítási feltételek", ""],
    ["distributionConditions", "Forgalmazási feltételek", ""],
    ["physical", "Fizikai jellemzők", ""],
    ["chemical", "Kémiai jellemzők", ""],
    ["micro", "Mikrobiológiai jellemzők", ""],
    ["sensory", "Érzékszervi jellemzők", ""],
    ["foodSafety", "Élelmiszerbiztonsági kritériumok", ""],
    ["labelling", "Jelölés, gyártási azonosító", ""],
    ["claims", "Állítások", ""],
    ["mayContain", "Nyomokban tartalmazhat", ""],
    ["servingsPerPack", "Adagok száma a csomagban", ""],
    ["infoLine", "Info vonal", ""],
    ["website", "Weboldal", ""],
    ["barcode", "Vonalkód", ""],
    ["preparedBy", "Gyártmánylap elkészítéséért felelős", ""],
    ["responsible", "Szakmailag felelős személy", ""],
    ["approver", "Jóváhagyó", ""],
    ["effectiveDate", "Érvénybe lépés dátuma", ""],
  ] as const)
    manualOnly(k, l, d);
  basics.legalRef = {
    label: "Jogszabály azonosító",
    original: "1169/2011/EU",
    calculated: "1169/2011/EU",
    display: "1169/2011/EU",
    origin: "source",
  };

  const weightG = toNum(basics.productWeight.display) ?? null;

  // ---- nutrition: calculate first, round last
  const ings = p.ingredients;
  const totalQty = ings.reduce((s, i) => s + (i.raw.quantity ?? 0), 0);
  const dec = p.conflictDecisions ?? {};
  const nv = (i: (typeof ings)[number], k: string) =>
    dec[`ing.${i.raw.row}.${k}`]?.value ?? (i.raw.nutrients as Record<string, number>)[k] ?? 0;
  const sum = (k: string) =>
    totalQty ? ings.reduce((s, i) => s + (i.raw.quantity ?? 0) * nv(i, k), 0) / totalQty : 0;
  const hasEnergy = ings.some((i) => i.raw.nutrients.energyKj != null);
  const per100: Record<string, number> = {};
  for (const k of NUTRIENTS) per100[k] = sum(k);
  per100.totalSolids = sum("totalSolids");
  if (!hasEnergy) {
    per100.energyKj =
      per100.fat * 37 + per100.carbohydrate * 17 + per100.protein * 17 + per100.fibre * 8;
    per100.energyKcal =
      per100.fat * 9 + per100.carbohydrate * 4 + per100.protein * 4 + per100.fibre * 2;
  }
  const nutrition: NutritionRow[] = NUTRIENTS.map((key) => {
    const ov = p.overrides[`n100.${key}`];
    const r = roundNutrient(key, per100[key]);
    const calcRule =
      key.startsWith("energy") && !hasEnergy ? ruleLabel("r-energy-calc") : ruleLabel("r-weighted");
    const col = p.raw.columnMap[key];
    const v100: TracedValue = {
      label: NUTRIENT_LABELS[key],
      original: col
        ? `Σ ${p.raw.sheet}!${col}${ings[0]?.raw.row ?? ""}:${col}${ings[ings.length - 1]?.raw.row ?? ""}`
        : "—",
      calculated: per100[key],
      display: ov ? ov.value : r.display,
      origin: ov ? "manual" : "calculated",
      rule: `${calcRule} → ${ruleLabel(r.ruleId)}`,
      source: col
        ? src(`${col}${ings[0]?.raw.row}:${col}${ings[ings.length - 1]?.raw.row}`)
        : undefined,
      manual: ov,
    };
    let vs: TracedValue | null = null;
    if (weightG) {
      const c = (per100[key] * weightG) / 100;
      const rs = roundNutrient(key, c);
      vs = {
        label: `${NUTRIENT_LABELS[key]} / ${huNumber(weightG, 0)} g`,
        original: per100[key],
        calculated: c,
        display: rs.display,
        origin: "calculated",
        rule: `${ruleLabel("r-serving")} → ${ruleLabel(rs.ruleId)}`,
      };
    }
    return { key, per100: v100, perServing: vs };
  });
  basics.totalSolids = {
    label: "Szárazanyag",
    original: null,
    calculated: per100.totalSolids,
    display: per100.totalSolids ? `${huNumber(per100.totalSolids, 1)} %` : "",
    origin: "calculated",
    rule: ruleLabel("r-weighted"),
  };

  // ---- ingredient text
  const byId = new Map(dict.map((d) => [d.id, d]));
  const sorted = [...ings].sort((a, b) => (b.raw.quantity ?? 0) - (a.raw.quantity ?? 0));
  const segs: Segment[] = [];
  const allergens = new Set<string>();
  const fmt = (t: string) => (settings.allergenFormat === "bold" ? t : t.toUpperCase());
  sorted.forEach((i, idx) => {
    const e = i.entryId && i.status === "recognized" ? byId.get(i.entryId) : undefined;
    if (idx > 0) segs.push({ text: ", " });
    if (!e) {
      segs.push({ text: `[${i.raw.name} – ismeretlen]` });
      return;
    }
    if (e.allergen) {
      allergens.add(e.allergen);
      segs.push({ text: fmt(e.packagingName), emph: settings.allergenFormat !== "uppercase" });
    } else segs.push({ text: e.packagingName });
    if (e.showPercentage) segs.push({ text: ` ${Math.round(i.percentage)}%` });
    if (e.subIngredients) segs.push({ text: ` (${e.subIngredients})` });
  });
  const autoText = segs.map((s) => s.text).join("");
  const autoAllergens = [...allergens].join("; ");
  const alOv = p.overrides.allergenList;
  basics.allergenList = alOv
    ? {
        label: "Allergének",
        original: autoAllergens || null,
        calculated: autoAllergens,
        display: alOv.value,
        origin: "manual",
        manual: alOv,
      }
    : {
        label: "Allergének",
        original: null,
        calculated: autoAllergens,
        display: autoAllergens,
        origin: "calculated",
        rule: ruleLabel("r-allergen"),
      };
  const finalAllergens = basics.allergenList.display
    ? basics.allergenList.display.split("; ").filter(Boolean)
    : [];
  const manualText = p.ingredientTextOverride;
  const ingredientSegments = manualText ? [{ text: manualText }] : segs;

  // ---- validation
  const checks: Check[] = [];
  const rec = ings.filter((i) => i.status === "recognized").length;
  const rev = ings.filter((i) => i.status === "review" && !i.deferred).length;
  const unk = ings.filter((i) => i.status === "unknown" && !i.deferred).length;
  const deferred = ings.filter((i) => i.deferred).length;
  checks.push(
    ings.length
      ? { id: "recipe", level: "ok", text: `Recept beolvasva (${ings.length} alapanyag)` }
      : { id: "recipe", level: "error", text: "Nem található alapanyag lista a fájlban" },
  );
  checks.push(
    weightG
      ? { id: "weight", level: "ok", text: "Terméktömeg megtalálva" }
      : {
          id: "weight",
          level: "error",
          text: "Nem sikerült azonosítani: Terméktömeg",
          action: "set-value",
          field: "productWeight",
        },
  );
  checks.push(
    per100.energyKj > 0
      ? {
          id: "energy",
          level: "ok",
          text: hasEnergy ? "Energiaérték megtalálva" : "Energiaérték kiszámítva",
        }
      : { id: "energy", level: "error", text: "Energiaérték nem számítható" },
  );
  if (rec) checks.push({ id: "rec", level: "ok", text: `${rec} alapanyag felismerve` });
  if (rev)
    checks.push({
      id: "rev",
      level: "warn",
      text: `${rev} alapanyag ellenőrzést igényel`,
      action: "resolve-ingredients",
    });
  if (unk)
    checks.push({
      id: "unk",
      level: "error",
      text: `${unk} ismeretlen alapanyag`,
      action: "resolve-ingredients",
    });
  if (deferred)
    checks.push({
      id: "def",
      level: "error",
      text: `${deferred} alapanyag későbbi ellenőrzésre félretéve`,
      action: "resolve-ingredients",
    });
  if (ings.some((i) => i.raw.quantity == null))
    checks.push({
      id: "qty",
      level: "error",
      text: "Kötelező érték hiányzik: alapanyag mennyiség",
    });
  if (!basics.productName.display)
    checks.push({
      id: "name",
      level: "error",
      text: "Nem sikerült azonosítani: Terméknév",
      action: "set-value",
      field: "productName",
    });
  if (!basics.marketingName.display)
    checks.push({
      id: "mkt",
      level: "warn",
      text: "Termék kereskedelmi neve nincs megadva",
      action: "set-value",
      field: "marketingName",
    });
  if (!basics.manufacturer.display)
    checks.push({
      id: "mfr",
      level: "warn",
      text: "Gyártó adatai nincsenek megadva",
      action: "set-value",
      field: "manufacturer",
    });
  if (manualText)
    checks.push({
      id: "txt",
      level: "warn",
      text: "Összetevők szövege manuálisan módosítva – ellenőrizendő",
    });
  for (const k of ["bestBeforeWording", "legalText"]) {
    if (p.overrides[k] && !p.regulatoryAck?.[k])
      checks.push({
        id: `reg-${k}`,
        level: "error",
        text: `JOGSZABÁLYI ELLENŐRZÉS SZÜKSÉGES: ${basics[k].label}`,
        action: "regulatory",
        field: k,
      });
  }

  // ---- multi-file package checks
  const files = p.files ?? [];
  if (files.length) {
    const specs = files.filter((f) => f.sourceType !== "HISTORICAL_REFERENCE");
    const unreadable = files.filter((f) => f.status === "unreadable").length;
    const suggested = files.filter((f) => f.linkState === "suggested").length;
    const open = findConflicts(p).filter((c) => !dec[c.id]).length;
    const unk = files.reduce((n, f) => n + f.unknown.filter((u) => !u.decision).length, 0);
    const reg = files.reduce(
      (n, f) => n + f.regulatory.filter((r) => r.status === "review").length,
      0,
    );
    checks.push({
      id: "src-specs",
      level: "ok",
      text: `${specs.length} alapanyag specifikáció beolvasva`,
    });
    const legacyFiles = files.filter((f) => f.ext === "doc" && f.status !== "ok");
    const legacyOpen = legacyFiles.filter((f) => !p.partialReviewAck?.[f.id]).length;
    if (legacyOpen)
      checks.push({
        id: "src-legacy",
        level: "error",
        text: `! Régi Word formátum: ${legacyOpen} dokumentum csak részlegesen olvasható – kézi ellenőrzés szükséges`,
        action: "sources",
      });
    else if (legacyFiles.length)
      checks.push({
        id: "src-legacy",
        level: "ok",
        text: `Régi Word dokumentum kézzel ellenőrizve (${legacyFiles.length})`,
      });
    if (unreadable)
      checks.push({
        id: "src-unread",
        level: "warn",
        text: `${unreadable} fájl nem olvasható`,
        action: "sources",
      });
    if (suggested)
      checks.push({
        id: "src-link",
        level: "warn",
        text: `${suggested} bizonytalan alapanyag-kapcsolat`,
        action: "sources",
      });
    if (open)
      checks.push({
        id: "src-conf",
        level: "error",
        text: `${open} ütköző érték (ELTÉRŐ ADATOK)`,
        action: "sources",
      });
    if (unk)
      checks.push({
        id: "src-unk",
        level: "warn",
        text: `${unk} új / nem besorolt adat`,
        action: "sources",
      });
    if (reg)
      checks.push({
        id: "src-reg",
        level: "error",
        text: `JOGSZABÁLYI ELLENŐRZÉS: ${reg} hivatkozás ellenőrzendő`,
        action: "sources",
      });
  }

  const counts = {
    ok: checks.filter((c) => c.level === "ok").length,
    warn: checks.filter((c) => c.level === "warn").length,
    error: checks.filter((c) => c.level === "error").length,
  };
  void autoText;
  return {
    basics,
    nutrition,
    ingredientSegments,
    ingredientText: manualText ?? autoText,
    ingredientTextManual: !!manualText,
    allergens: finalAllergens,
    checks,
    counts,
    totalQty,
    weightG,
  };
}

export function autoIngredientText(p: Product, dict: DictionaryEntry[], s: Settings) {
  return buildDataset({ ...p, ingredientTextOverride: undefined }, dict, s).ingredientText;
}
