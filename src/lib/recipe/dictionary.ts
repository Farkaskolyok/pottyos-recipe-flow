import type { DictionaryEntry, MatchStatus } from "./types";
import { norm } from "./format";

// Fictional demo dictionary. No real recipe data.
export const DEMO_DICTIONARY: DictionaryEntry[] = [
  {
    id: "d-turo",
    technicalName: "Sovány túró 40+",
    aliases: ["TURO_40", "SOVANY_TURO", "Túró félzsíros A"],
    canonicalName: "sovány túró",
    packagingName: "sovány túró",
    materialCode: "DM-1001",
    manufacturer: "Demo Tejüzem",
    allergen: "tej",
    group: "Tejtermék",
    showPercentage: true,
    status: "approved",
  },
  {
    id: "d-bevono",
    technicalName: "Kakaós étbevonó KB-12",
    aliases: ["KB12", "ETBEVONO_KB"],
    canonicalName: "kakaós étbevonómassza",
    packagingName: "kakaós étbevonómassza",
    materialCode: "DM-2012",
    manufacturer: "Demo Csokoládé Kft.",
    group: "Bevonó",
    subIngredients: "cukor, kakaóvaj, kakaómassza, emulgeálószer: napraforgó-lecitin",
    showPercentage: true,
    status: "approved",
  },
  {
    id: "d-cukor",
    technicalName: "Kristálycukor",
    aliases: ["CUKOR", "Sugar EU2"],
    canonicalName: "cukor",
    packagingName: "cukor",
    materialCode: "DM-3001",
    group: "Édesítő",
    showPercentage: false,
    status: "approved",
  },
  {
    id: "d-vaj",
    technicalName: "Vaj 82%",
    aliases: ["VAJ_82", "Butter 82"],
    canonicalName: "vaj",
    packagingName: "vaj",
    materialCode: "DM-1082",
    allergen: "tej",
    group: "Tejtermék",
    showPercentage: false,
    status: "approved",
  },
  {
    id: "d-vanilia",
    technicalName: "Vanília aroma",
    aliases: ["AROMA_VAN"],
    canonicalName: "vanília aroma",
    packagingName: "természetes vanília aroma",
    materialCode: "DM-4003",
    group: "Aroma",
    showPercentage: false,
    status: "approved",
  },
  {
    id: "d-savo",
    technicalName: "Édes tejsavópor",
    aliases: ["SAVOPOR"],
    canonicalName: "tejsavópor",
    packagingName: "tejsavópor",
    materialCode: "DM-1200",
    allergen: "tej",
    group: "Tejtermék",
    showPercentage: false,
    status: "approved",
  },
];

/** Deterministic matching: exact name/alias/code → Felismert; strong word overlap → Ellenőrizendő; else Ismeretlen. */
export function matchIngredient(
  name: string,
  code: string | undefined,
  dict: DictionaryEntry[],
): { status: MatchStatus; entryId: string | null } {
  const n = norm(name);
  const c = code ? norm(code) : "";
  for (const e of dict) {
    const keys = [e.technicalName, ...e.aliases].map(norm);
    if (keys.includes(n) || (c && e.materialCode && norm(e.materialCode) === c))
      return { status: "recognized", entryId: e.id };
  }
  const words = new Set(n.split(" ").filter((w) => w.length > 2));
  let best: { id: string; score: number } | null = null;
  for (const e of dict) {
    const ew = norm(e.technicalName).split(" ").filter((w) => w.length > 2);
    if (!ew.length) continue;
    const hit = ew.filter((w) => words.has(w)).length / ew.length;
    if (hit >= 0.5 && (!best || hit > best.score)) best = { id: e.id, score: hit };
  }
  if (best) return { status: "review", entryId: best.id };
  return { status: "unknown", entryId: null };
}
