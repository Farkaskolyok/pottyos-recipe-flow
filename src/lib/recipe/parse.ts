import * as XLSX from "xlsx";
import type { RawIngredientRow, RawRecipe } from "./types";
import { colLetter, norm } from "./format";

/** Import template: header aliases per field. Structures are detected by header text, not fixed cells. */
export interface ImportTemplate {
  id: string;
  name: string;
  preferredSheet?: string;
  columns: Record<string, string[]>;
  meta: Record<string, string[]>;
}

export const IMPORT_TEMPLATES: ImportTemplate[] = [
  {
    id: "pottyos-v1",
    name: "Pöttyös Recipe Template v1",
    preferredSheet: "Recipe",
    columns: {
      name: ["material name", "alapanyag", "alapanyag neve", "anyag neve", "megnevezes"],
      code: ["material code", "anyagkod", "cikkszam", "kod"],
      producer: ["producer", "gyarto", "beszallito", "supplier"],
      quantity: ["quantity", "mennyiseg", "mennyiseg kg", "quantity kg", "kg", "arany"],
      protein: ["protein", "feherje"],
      carbohydrate: ["carbohydrate", "szenhidrat", "carbs"],
      sugars: ["sugars", "cukor", "cukrok", "ebbol cukrok"],
      fat: ["fat", "zsir"],
      saturates: ["saturates", "telitett", "telitett zsirsav", "ebbol telitett zsirsavak", "sfa"],
      salt: ["salt", "so"],
      fibre: ["dietary fibre", "fibre", "fiber", "rost", "elelmi rost"],
      totalSolids: ["total solids", "szarazanyag", "ts"],
      energyKj: ["energy kj", "energia kj", "kj"],
      energyKcal: ["energy kcal", "energia kcal", "kcal"],
    },
    meta: {
      productName: ["product name", "termek neve", "termeknev", "termek"],
      productWeight: ["product weight", "termektomeg", "netto tomeg", "net weight", "termek tomeg g"],
      servingSize: ["serving size", "adag", "adagmeret"],
      packaging: ["packaging", "csomagolas"],
      losses: ["losses", "veszteseg", "gyartasi veszteseg"],
      recipeVersion: ["recipe version", "receptverzio", "verzio"],
    },
  },
];

type Grid = (string | number | null)[][];

function sheetGrid(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as Grid;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.replace(/\s/g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
    if (t === "" || t === "-" || t === ".") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function matchField(header: string, aliases: Record<string, string[]>): string | null {
  const h = norm(header);
  if (!h) return null;
  // exact match first, then prefix match
  for (const [f, al] of Object.entries(aliases)) if (al.includes(h)) return f;
  for (const [f, al] of Object.entries(aliases))
    if (al.some((a) => a.length > 2 && (h.startsWith(a + " ") || h.startsWith(a)))) return f;
  return null;
}

function findHeader(grid: Grid, tpl: ImportTemplate) {
  let best = { row: -1, map: {} as Record<string, number> };
  for (let r = 0; r < Math.min(grid.length, 60); r++) {
    const map: Record<string, number> = {};
    (grid[r] ?? []).forEach((cell, c) => {
      if (typeof cell !== "string") return;
      const f = matchField(cell, tpl.columns);
      if (f && map[f] === undefined) map[f] = c;
    });
    if (Object.keys(map).length > Object.keys(best.map).length) best = { row: r, map };
  }
  return best;
}

export async function readWorkbook(file: File) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

export function parseWorkbook(wb: XLSX.WorkBook, fileName: string, fileSize: number): RawRecipe {
  const tpl = IMPORT_TEMPLATES[0];
  // pick sheet with the best header match
  let chosen = { sheet: wb.SheetNames[0], grid: [] as Grid, header: { row: -1, map: {} as Record<string, number> } };
  for (const s of wb.SheetNames) {
    const grid = sheetGrid(wb.Sheets[s]);
    const header = findHeader(grid, tpl);
    if (Object.keys(header.map).length > Object.keys(chosen.header.map).length) chosen = { sheet: s, grid, header };
  }
  const { grid, header, sheet } = chosen;
  const cols = header.map;
  const cell = (r: number, c: number) => `${colLetter(c)}${r + 1}`;

  // metadata: label cell followed by value to the right (scan whole sheet, all sheets)
  const meta: RawRecipe["meta"] = {};
  for (const s of wb.SheetNames) {
    const g = sheetGrid(wb.Sheets[s]);
    g.forEach((row, r) =>
      row.forEach((v, c) => {
        if (typeof v !== "string") return;
        const f = matchField(v.replace(/[:()]/g, " "), tpl.meta);
        if (!f || meta[f]) return;
        for (let k = c + 1; k < Math.min(row.length, c + 4); k++) {
          const val = row[k];
          if (val !== null && val !== "") {
            meta[f] = { value: val, cell: s === sheet ? cell(r, k) : `${s}!${cell(r, k)}` };
            break;
          }
        }
      }),
    );
  }

  const ingredients: RawIngredientRow[] = [];
  if (header.row >= 0 && cols.name !== undefined) {
    for (let r = header.row + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const name = row[cols.name];
      if (typeof name !== "string" || !name.trim()) continue;
      const n = norm(name);
      if (["total", "osszesen", "osszes", "sum"].includes(n)) break;
      const refs: Record<string, string> = {};
      const nutrients: RawIngredientRow["nutrients"] = {};
      for (const [f, c] of Object.entries(cols)) {
        refs[f] = cell(r, c);
        if (["name", "code", "producer", "quantity"].includes(f)) continue;
        const v = toNum(row[c]);
        if (v !== null) (nutrients as Record<string, number>)[f] = v;
      }
      ingredients.push({
        row: r + 1,
        name: name.trim(),
        code: cols.code !== undefined && row[cols.code] != null ? String(row[cols.code]) : undefined,
        producer: cols.producer !== undefined && row[cols.producer] != null ? String(row[cols.producer]) : undefined,
        quantity: cols.quantity !== undefined ? toNum(row[cols.quantity]) : null,
        nutrients,
        refs,
      });
    }
  }

  const confident = cols.name !== undefined && cols.quantity !== undefined && Object.keys(cols).length >= 5;
  return {
    fileName,
    fileSize,
    sheetNames: wb.SheetNames,
    sheet,
    templateId: confident ? tpl.id : null,
    meta,
    ingredients,
    columnMap: Object.fromEntries(Object.entries(cols).map(([f, c]) => [f, colLetter(c)])),
  };
}
