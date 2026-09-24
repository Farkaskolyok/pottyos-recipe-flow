import type { Product, DictionaryEntry } from "./types";
import type { Dataset, Segment, Settings, Destination } from "./engine";
import { huDate, huNumber } from "./format";

export type Block =
  | { type: "heading"; text: string }
  | { type: "kv"; rows: KVRow[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "rich"; segments: Segment[]; field?: string; prefix?: Segment[]; suffix?: Segment[] }
  | { type: "para"; text: string; field?: string; prefix?: string };

/** [label, value, fieldKey?] — fieldKey enables inline editing in the preview */
export type KVRow = [string, string] | [string, string, string];

export interface DocModel {
  kind: Destination;
  title: string;
  fileName: string;
  meta: KVRow[];
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
  const basicRows = (d: Destination): KVRow[] => {
    const r: KVRow[] = [];
    if (vis("productName", d)) r.push(["Terméknév", name, "productName"]);
    if (vis("marketingName", d) && b.marketingName.display) r.push(["Marketing megnevezés", b.marketingName.display, "marketingName"]);
    if (vis("productWeight", d)) r.push(["Nettó tömeg", b.productWeight.display || "—", "productWeight"]);
    if (vis("servingSize", d) && b.servingSize.display) r.push(["Adagméret", b.servingSize.display, "servingSize"]);
    if (vis("packaging", d) && b.packaging.display) r.push(["Csomagolás", b.packaging.display, "packaging"]);
    if (vis("losses", d) && b.losses.display) r.push(["Gyártási veszteség", b.losses.display, "losses"]);
    if (vis("totalSolids", d) && b.totalSolids.display) r.push(["Szárazanyag", b.totalSolids.display]);
    if (d !== "pack") {
      r.push(["Állag", b.texture.display, "texture"]);
      r.push(["Elfogadhatósági tartomány", b.acceptanceRange.display, "acceptanceRange"]);
    }
    return r;
  };
  const meta: KVRow[] = [
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
      { type: "kv", rows: [...basicRows("spec"), ["Termékleírás", b.description.display, "description"]] },
      { type: "heading", text: "Összetevők" },
      { type: "rich", segments: ds.ingredientSegments, field: "ingredientText" },
      { type: "heading", text: "Allergének" },
      { type: "para", text: ds.allergens.length ? ds.allergens.join(", ") : "Nem tartalmaz jelölésköteles allergént.", field: "allergenList", prefix: "Tartalmaz: " },
      { type: "heading", text: "Tápérték" },
      nutritionTable("spec"),
      { type: "heading", text: "Tárolás és gyártó" },
      { type: "kv", rows: [["Tárolási mód", b.storageMode.display, "storageMode"], ["Tárolás", b.storage.display, "storage"], ["Gyártó", b.manufacturer.display, "manufacturer"], ["Forgalmazó", b.distributor.display, "distributor"], ["Minőségmegőrzés", b.bestBeforeWording.display, "bestBeforeWording"]] },
      { type: "heading", text: "Jogszabályi információ" },
      { type: "kv", rows: [["Jogszabály azonosító", b.legalRef.display, "legalRef"]] },
      { type: "para", text: b.legalText.display, field: "legalText" },
    ],
  };
  const packBlocks: Block[] = [{ type: "heading", text: b.marketingName.display || name }];
  packBlocks.push({ type: "para", text: b.description.display, field: "description" });
  packBlocks.push({ type: "rich", segments: ds.ingredientSegments, field: "ingredientText", prefix: [{ text: "Összetevők: ", emph: true }], suffix: [{ text: "." }] });
  if (ds.allergens.length)
    packBlocks.push({ type: "para", text: `Allergén információ: a kiemelt összetevők allergént tartalmaznak (${ds.allergens.join(", ")}).` });
  packBlocks.push(nutritionTable("pack"));
  packBlocks.push({ type: "para", text: b.productWeight.display, field: "productWeight", prefix: "Nettó tömeg: " });
  packBlocks.push({ type: "para", text: b.storageMode.display, field: "storageMode", prefix: "Tárolási mód: " });
  packBlocks.push({ type: "para", text: b.storage.display, field: "storage", prefix: "Tárolás: " });
  packBlocks.push({ type: "para", text: `${b.bestBeforeWording.display} lásd a csomagoláson`, field: "bestBeforeWording", prefix: "" });
  packBlocks.push({ type: "para", text: b.manufacturer.display, field: "manufacturer", prefix: "Gyártó: " });
  if (b.distributor.display) packBlocks.push({ type: "para", text: b.distributor.display, field: "distributor", prefix: "Forgalmazó: " });
  const pack: DocModel = {
    kind: "pack",
    title: DOC_TITLES.pack,
    fileName: `${safe}_Csomagolasi_szoveg_${p.docVersion}.docx`,
    meta,
    blocks: packBlocks,
  };
  return { sheet, spec, pack };
}
