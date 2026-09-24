import * as XLSX from "xlsx";
import type { DictionaryEntry, Product } from "./types";
import { parseWorkbook } from "./parse";
import { resolveIngredients } from "./engine";
import { uid } from "./format";
import { applyLinkSuggestions, demoSpecFiles } from "./sources";

// Entirely fictional demo recipes. Values are invented for demonstration only.
type Row = [
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
// name, code, producer, qty kg, protein, carb, sugars, fat, saturates, salt, fibre, total solids

export interface DemoRecipe {
  key: string;
  productName: string;
  weight: number;
  version: string;
  rows: Row[];
}

export const DEMO_RECIPES: DemoRecipe[] = [
  {
    key: "classic",
    productName: "Pöttyös Demo Classic",
    weight: 51,
    version: "R-1.0",
    rows: [
      ["TURO_40", "DM-1001", "Demo Tejüzem", 52, 12.4, 3.6, 3.4, 4.1, 2.6, 0.08, 0, 22.5],
      [
        "Kakaós étbevonó KB-12",
        "DM-2012",
        "Demo Csokoládé Kft.",
        30,
        5.2,
        54.8,
        48.1,
        32.6,
        19.4,
        0.04,
        6.1,
        99,
      ],
      ["Kristálycukor", "DM-3001", "Demo Cukor Zrt.", 10.5, 0, 99.9, 99.9, 0, 0, 0, 0, 99.9],
      ["Vaj 82%", "DM-1082", "Demo Tejüzem", 5.5, 0.7, 0.6, 0.6, 82, 54.1, 0.02, 0, 84],
      [
        "ABC Whey Powder X27",
        "",
        "Supplier Compound Ltd.",
        1.5,
        12.1,
        72.3,
        71.8,
        1.1,
        0.7,
        2.1,
        0,
        96.5,
      ],
      ["Vanilia aroma V3", "", "Demo Aroma Bt.", 0.5, 0, 0, 0, 0, 0, 0, 0, 40],
    ],
  },
  {
    key: "cocoa",
    productName: "Pöttyös Demo Cocoa",
    weight: 38,
    version: "R-2.1",
    rows: [
      ["SOVANY_TURO", "DM-1001", "Demo Tejüzem", 55, 12.4, 3.6, 3.4, 4.1, 2.6, 0.08, 0, 22.5],
      [
        "ETBEVONO_KB",
        "DM-2012",
        "Demo Csokoládé Kft.",
        33,
        5.2,
        54.8,
        48.1,
        32.6,
        19.4,
        0.04,
        6.1,
        99,
      ],
      ["CUKOR", "DM-3001", "Demo Cukor Zrt.", 11, 0, 99.9, 99.9, 0, 0, 0, 0, 99.9],
      ["AROMA_VAN", "DM-4003", "Demo Aroma Bt.", 1, 0, 0, 0, 0, 0, 0, 0, 40],
    ],
  },
  {
    key: "strawberry",
    productName: "Pöttyös Demo Strawberry",
    weight: 30,
    version: "R-1.2",
    rows: [
      ["Sovány túró 40+", "DM-1001", "Demo Tejüzem", 58, 12.4, 3.6, 3.4, 4.1, 2.6, 0.08, 0, 22.5],
      [
        "Kakaós étbevonó KB-12",
        "DM-2012",
        "Demo Csokoládé Kft.",
        28,
        5.2,
        54.8,
        48.1,
        32.6,
        19.4,
        0.04,
        6.1,
        99,
      ],
      ["Kristálycukor", "DM-3001", "Demo Cukor Zrt.", 9, 0, 99.9, 99.9, 0, 0, 0, 0, 99.9],
      ["Eper készítmény EK-5", "", "Demo Gyümölcs Kft.", 5, 0.4, 45, 42, 0.1, 0, 0.01, 1.2, 48],
    ],
  },
  {
    key: "raspberry",
    productName: "Pöttyös Demo Málnás Müzlis",
    weight: 38,
    version: "R-3.0",
    rows: [
      ["Sovány túró 40+", "DM-1001", "Demo Tejüzem", 50, 12.4, 3.6, 3.4, 4.1, 2.6, 0.08, 0, 22.5],
      [
        "Joghurtos bevonómassza",
        "DM-2050",
        "Demo Bevonó Kft.",
        32,
        6.1,
        55.2,
        52.4,
        34.5,
        29.8,
        0.09,
        0.4,
        99,
      ],
      ["Málna-müzli", "DM-6020", "Demo Müzli Zrt.", 10, 8.2, 64.1, 21.5, 6.3, 1.1, 0.02, 7.4, 92],
      ["Inulin", "DM-5010", "Demo Fibre Ltd.", 7, 0, 5, 5, 0, 0, 0, 90, 95],
      ["Raspberry flavour mix AR-7", "", "Demo Aroma Bt.", 1, 0, 0, 0, 0, 0, 0, 0, 40],
    ],
  },
];

export function buildDemoWorkbook(d: DemoRecipe): XLSX.WorkBook {
  const head = [
    ["DEMO RECEPT – fiktív adatok"],
    [],
    ["Product name:", d.productName],
    ["Recipe version:", d.version],
    ["Product weight (g):", d.weight],
    ["Serving size (g):", d.weight],
    ["Packaging:", "Alumínium fólia, gyűjtő karton 12 db"],
    ["Losses (%):", 1.5],
    [],
    [
      "Material name",
      "Material code",
      "Producer",
      "Quantity (kg)",
      "Protein",
      "Carbohydrate",
      "Sugars",
      "Fat",
      "Saturates",
      "Salt",
      "Dietary fibre",
      "Total solids",
    ],
  ];
  const total = d.rows.reduce((s, r) => s + r[3], 0);
  const ws = XLSX.utils.aoa_to_sheet([...head, ...d.rows, ["Total", "", "", total]]);
  ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 22 }, ...Array(9).fill({ wch: 12 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recipe");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Megjegyzés"], ["Fiktív demó recept, nem valós adat."]]),
    "Notes",
  );
  return wb;
}

export function demoFile(d: DemoRecipe): File {
  const out = XLSX.write(buildDemoWorkbook(d), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], `Demo_${d.key}_recipe.xlsx`, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function newProduct(raw: Product["raw"], dict: DictionaryEntry[], user: string): Product {
  const now = new Date().toISOString();
  return {
    id: uid(),
    isDemo: false,
    internalId: `PT-${Math.floor(1000 + Math.random() * 9000)}`,
    recipeVersion: String(raw.meta.recipeVersion?.value ?? "—"),
    docVersion: "v1.0",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    createdBy: user,
    raw,
    ingredients: resolveIngredients(raw, dict),
    overrides: {},
    history: [{ version: "v1.0", date: now, note: "Recept beolvasva" }],
  };
}

/** Seed list for the home screen (Cocoa approved, Strawberry awaiting review). */
export function seedProducts(dict: DictionaryEntry[], user: string): Product[] {
  const mk = (d: DemoRecipe) => {
    const wb = buildDemoWorkbook(d);
    return {
      ...newProduct(parseWorkbook(wb, `Demo_${d.key}_recipe.xlsx`, 18_000), dict, user),
      isDemo: true,
    };
  };
  const cocoa = mk(DEMO_RECIPES[1]);
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  cocoa.status = "approved";
  cocoa.docVersion = "v1.2";
  cocoa.approvedBy = "Demo minőségügy";
  cocoa.overrides.marketingName = {
    value: "Kakaós túródesszert",
    by: user,
    at: day(3),
    previous: "",
  };
  cocoa.createdAt = day(5);
  cocoa.updatedAt = day(3);
  cocoa.history = [
    { version: "v1.0", date: day(5), note: "Recept beolvasva" },
    { version: "v1.1", date: day(4), note: "Marketing megnevezés megadva" },
    { version: "v1.2", date: day(3), note: "Jóváhagyva" },
  ];
  const straw = mk(DEMO_RECIPES[2]);
  straw.status = "review";
  straw.createdAt = day(1);
  straw.updatedAt = day(1);
  straw.history = [{ version: "v1.0", date: day(1), note: "Recept beolvasva" }];
  return [demoPackageProduct(dict, user), straw, cocoa];
}

/** Fictional multi-file product: 1 recipe + 4 specifications. */
export function demoPackageProduct(
  dict: DictionaryEntry[],
  user: string,
  recipeFile?: { name: string; size: number },
): Product {
  const d = DEMO_RECIPES[3];
  const name = recipeFile?.name ?? `Demo_${d.key}_recipe.xlsx`;
  const p = newProduct(
    parseWorkbook(buildDemoWorkbook(d), name, recipeFile?.size ?? 21_000),
    dict,
    user,
  );
  p.isDemo = true;
  p.status = "review";
  p.files = applyLinkSuggestions(
    demoSpecFiles(),
    p.ingredients.map((i) => ({ row: i.raw.row, name: i.raw.name })),
  );
  p.history = [
    {
      version: "v1.0",
      date: p.createdAt,
      note: "Termékcsomag beolvasva (1 recept, 4 specifikáció)",
    },
  ];
  p.audit = [{ at: p.createdAt, by: user, text: "Termékcsomag helyben feldolgozva" }];
  return p;
}
