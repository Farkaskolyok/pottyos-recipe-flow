import type { Product, DictionaryEntry } from "./types";
import type { Dataset, Segment, Settings, Destination } from "./engine";
import { huDate, huNumber } from "./format";

export type Block =
  | { type: "heading"; text: string }
  | { type: "kv"; rows: [string, string][] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "rich"; segments: Segment[] }
  | { type: "para"; text: string };

export interface DocModel {
  kind: Destination;
  title: string;
  fileName: string;
  meta: [string, string][];
  blocks: Block[];
}

export const DOC_TITLES: Record<Destination, string> = {
  sheet: "Gyártmánylap",
  spec: "Termékspecifikáció",
  pack: "Csomagolási szöveg",
};

export function buildDocs(p: Product, ds: Dataset, dict: DictionaryEntry[], s: Settings): Record<Destination, DocModel> {
  const vis = (field: string, d: Destination) => (s.visibility[field] ?? []).includes(d);
  const b = ds.basics;
  const name = b.productName.display || "—";
  const nutritionTable = (d: Destination): Block => {
    const serving = ds.weightG && vis("nutritionServing", d);
    return {
      type: "table",
      head: ["Tápérték", "100 g", ...(serving ? [`${huNumber(ds.weightG!, 0)} g`] : [])],
      rows: [
        [
          "Energia",
          `${ds.nutrition[0].per100.display} / ${ds.nutrition[1].per100.display}`,
          ...(serving ? [`${ds.nutrition[0].perServing!.display} / ${ds.nutrition[1].perServing!.display}`] : []),
        ],
        ...ds.nutrition.slice(2).map((n) => [n.per100.label, n.per100.display, ...(serving ? [n.perServing!.display] : [])]),
      ],
    };
  };
  const basicRows = (d: Destination): [string, string][] => {
    const r: [string, string][] = [];
    if (vis("productName", d)) r.push(["Terméknév", name]);
    if (vis("marketingName", d) && b.marketingName.display) r.push(["Marketing megnevezés", b.marketingName.display]);
    if (vis("productWeight", d)) r.push(["Nettó tömeg", b.productWeight.display || "—"]);
    if (vis("servingSize", d) && b.servingSize.display) r.push(["Adagméret", b.servingSize.display]);
    if (vis("packaging", d) && b.packaging.display) r.push(["Csomagolás", b.packaging.display]);
    if (vis("losses", d) && b.losses.display) r.push(["Gyártási veszteség", b.losses.display]);
    if (vis("totalSolids", d) && b.totalSolids.display) r.push(["Szárazanyag", b.totalSolids.display]);
    return r;
  };
  const meta: [string, string][] = [
    ["Termékazonosító", p.internalId],
    ["Receptverzió", p.recipeVersion],
    ["Dokumentumverzió", p.docVersion],
    ["Dátum", huDate(p.updatedAt)],
    ["Állapot", p.status === "approved" ? `Jóváhagyva – ${p.approvedBy ?? ""}` : "Nem jóváhagyott tervezet"],
  ];
  const byId = new Map(dict.map((d) => [d.id, d]));
  const safe = name.replace(/[^\p{L}\p{N}]+/gu, "_");

  const sheet: DocModel = {
    kind: "sheet",
    title: DOC_TITLES.sheet,
    fileName: `${safe}_Gyartmanylap_${p.docVersion}.docx`,
    meta,
    blocks: [
      { type: "heading", text: "Alapadatok" },
      { type: "kv", rows: basicRows("sheet") },
      { type: "heading", text: "Receptúra" },
      {
        type: "table",
        head: ["Alapanyag", "Anyagkód", "Mennyiség (kg)", "Arány"],
        rows: [...p.ingredients]
          .sort((a, c) => (c.raw.quantity ?? 0) - (a.raw.quantity ?? 0))
          .map((i) => {
            const e = i.entryId ? byId.get(i.entryId) : undefined;
            return [
              e && i.status === "recognized" ? e.canonicalName : `${i.raw.name} (ismeretlen)`,
              i.raw.code || e?.materialCode || "—",
              huNumber(i.raw.quantity ?? 0, 2),
              `${huNumber(i.percentage, 1)} %`,
            ];
          }),
      },
      { type: "heading", text: "Tápérték (számított)" },
      nutritionTable("sheet"),
      { type: "heading", text: "Jóváhagyás" },
      { type: "kv", rows: [["Készítette", p.createdBy], ["Ellenőrizte", p.reviewedBy ?? ""], ["Jóváhagyta", p.approvedBy ?? ""]] },
    ],
  };
  const spec: DocModel = {
    kind: "spec",
    title: DOC_TITLES.spec,
    fileName: `${safe}_Termekspecifikacio_${p.docVersion}.docx`,
    meta,
    blocks: [
      { type: "heading", text: "Termékadatok" },
      { type: "kv", rows: [...basicRows("spec"), ...(b.description.display ? [["Termékleírás", b.description.display] as [string, string]] : [])] },
      { type: "heading", text: "Összetevők" },
      { type: "rich", segments: ds.ingredientSegments },
      { type: "heading", text: "Allergének" },
      { type: "para", text: ds.allergens.length ? `Tartalmaz: ${ds.allergens.join(", ")}.` : "Nem tartalmaz jelölésköteles allergént." },
      { type: "heading", text: "Tápérték" },
      nutritionTable("spec"),
      { type: "heading", text: "Tárolás és gyártó" },
      { type: "kv", rows: [["Tárolás", b.storage.display], ["Gyártó", b.manufacturer.display], ...(b.distributor.display ? [["Forgalmazó", b.distributor.display] as [string, string]] : [])] },
    ],
  };
  const packBlocks: Block[] = [{ type: "heading", text: b.marketingName.display || name }];
  if (b.description.display) packBlocks.push({ type: "para", text: b.description.display });
  packBlocks.push({ type: "rich", segments: [{ text: "Összetevők: ", emph: true }, ...ds.ingredientSegments, { text: "." }] });
  if (ds.allergens.length)
    packBlocks.push({ type: "para", text: `Allergén információ: a kiemelt összetevők allergént tartalmaznak (${ds.allergens.join(", ")}).` });
  packBlocks.push(nutritionTable("pack"));
  if (b.productWeight.display) packBlocks.push({ type: "para", text: `Nettó tömeg: ${b.productWeight.display}` });
  if (b.storage.display) packBlocks.push({ type: "para", text: `Tárolás: ${b.storage.display}` });
  if (b.manufacturer.display) packBlocks.push({ type: "para", text: `Gyártó: ${b.manufacturer.display}` });
  if (b.distributor.display) packBlocks.push({ type: "para", text: `Forgalmazó: ${b.distributor.display}` });
  const pack: DocModel = {
    kind: "pack",
    title: DOC_TITLES.pack,
    fileName: `${safe}_Csomagolasi_szoveg_${p.docVersion}.docx`,
    meta,
    blocks: packBlocks,
  };
  return { sheet, spec, pack };
}
