import type { NutrientKey } from "./types";
import { huNumber } from "./format";

export interface RuleDef {
  id: string;
  name: string;
  version: string;
  category: string;
  description: string;
  input: string;
  condition: string;
  transformation: string;
  output: string;
  priority: number;
  active: boolean;
  scope: string;
}

export const DEFAULT_RULES: RuleDef[] = [
  {
    id: "r-energy",
    name: "Energia kerekítés",
    version: "v1",
    category: "Kerekítés",
    description: "Energiaérték egész számra.",
    input: "Energia (kJ, kcal)",
    condition: "minden érték",
    transformation: "egészre kerekítés",
    output: "pl. 1523 kJ",
    priority: 10,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-macro",
    name: "Zsír / szénhidrát / cukor / fehérje / rost kerekítés",
    version: "v2",
    category: "Kerekítés",
    description: "≥10 g: egész; 0,5–10 g: 1 tizedes; <0,5 g: „<0,5 g”.",
    input: "Zsír, szénhidrát, cukrok, fehérje, rost",
    condition: "érték tartománya szerint",
    transformation: "tartományos kerekítés",
    output: "14,8736 → 15 g",
    priority: 20,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-sat",
    name: "Telített zsírsav kerekítés",
    version: "v1",
    category: "Kerekítés",
    description: "≥10 g: egész; 0,1–10 g: 1 tizedes; <0,1 g: „<0,1 g”.",
    input: "Telített zsírsavak",
    condition: "érték tartománya szerint",
    transformation: "tartományos kerekítés",
    output: "5,63 → 5,6 g",
    priority: 20,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-salt",
    name: "Só kerekítés",
    version: "v1",
    category: "Kerekítés",
    description: "≥1 g: 1 tizedes; 0,0125–1 g: 2 tizedes; alatta „<0,01 g”.",
    input: "Só",
    condition: "érték tartománya szerint",
    transformation: "tartományos kerekítés",
    output: "0,237 → 0,24 g",
    priority: 20,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-energy-calc",
    name: "Energia számítás",
    version: "v1",
    category: "Tápérték",
    description: "Ha a recept nem tartalmaz energiát: zsír 37/9, szénhidrát 17/4, fehérje 17/4, rost 8/2 kJ/kcal.",
    input: "Makrotápanyagok / 100 g",
    condition: "energia nincs megadva",
    transformation: "átváltási tényezők",
    output: "kJ és kcal / 100 g",
    priority: 5,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-weighted",
    name: "Súlyozott tápérték",
    version: "v1",
    category: "Tápérték",
    description: "Tápérték / 100 g = Σ(mennyiség × érték) / Σ mennyiség. Előbb számítás, utána kerekítés.",
    input: "Alapanyag mennyiségek és tápértékek",
    condition: "minden termék",
    transformation: "súlyozott átlag",
    output: "Tápérték / 100 g",
    priority: 1,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-serving",
    name: "Adagérték",
    version: "v1",
    category: "Adagértékek",
    description: "Adagérték = 100 g érték × terméktömeg / 100, kerekítés csak ezután.",
    input: "Tápérték / 100 g, terméktömeg",
    condition: "terméktömeg ismert",
    transformation: "arányos számítás",
    output: "Tápérték / termék",
    priority: 30,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-order",
    name: "Összetevő sorrend",
    version: "v1",
    category: "Összetevők",
    description: "Csökkenő mennyiségi sorrend, jóváhagyott csomagolási megnevezéssel.",
    input: "Felismert alapanyagok",
    condition: "minden termék",
    transformation: "rendezés, megnevezés csere",
    output: "Összetevők szöveg",
    priority: 10,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-pct",
    name: "Százalék megjelenítés",
    version: "v1",
    category: "Százalékok",
    description: "Ahol a szótár előírja, egész százalékkal jelenik meg.",
    input: "Alapanyag aránya",
    condition: "szótárban „százalék” jelölve",
    transformation: "egészre kerekített arány",
    output: "sovány túró 52%",
    priority: 15,
    active: true,
    scope: "Minden termék",
  },
  {
    id: "r-allergen",
    name: "Allergén kiemelés",
    version: "v1",
    category: "Allergének",
    description: "Allergén összetevők kiemelése a sablon beállítása szerint.",
    input: "Szótár allergén mező",
    condition: "allergén megadva",
    transformation: "kiemelés (félkövér / nagybetű)",
    output: "SOVÁNY TÚRÓ",
    priority: 15,
    active: true,
    scope: "Minden termék",
  },
];

export interface Rounded {
  display: string;
  ruleId: string;
}

export function roundNutrient(key: NutrientKey, v: number): Rounded {
  const g = (s: string) => `${s} g`;
  switch (key) {
    case "energyKj":
      return { display: `${huNumber(Math.round(v), 0)} kJ`, ruleId: "r-energy" };
    case "energyKcal":
      return { display: `${huNumber(Math.round(v), 0)} kcal`, ruleId: "r-energy" };
    case "saturates":
      if (v >= 10) return { display: g(huNumber(Math.round(v), 0)), ruleId: "r-sat" };
      if (v >= 0.1) return { display: g(huNumber(v, 1)), ruleId: "r-sat" };
      return { display: "<0,1 g", ruleId: "r-sat" };
    case "salt":
      if (v >= 1) return { display: g(huNumber(v, 1)), ruleId: "r-salt" };
      if (v >= 0.0125) return { display: g(huNumber(v, 2)), ruleId: "r-salt" };
      return { display: "<0,01 g", ruleId: "r-salt" };
    default:
      if (v >= 10) return { display: g(huNumber(Math.round(v), 0)), ruleId: "r-macro" };
      if (v >= 0.5) return { display: g(huNumber(v, 1)), ruleId: "r-macro" };
      return { display: "<0,5 g", ruleId: "r-macro" };
  }
}

export function ruleLabel(id: string, rules: RuleDef[] = DEFAULT_RULES): string {
  const r = rules.find((x) => x.id === id);
  return r ? `${r.name} ${r.version}` : id;
}
