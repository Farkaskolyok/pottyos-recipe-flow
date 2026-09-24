import type { Product, DictionaryEntry } from "./types";
import type { Dataset, Segment, Settings, Destination } from "./engine";
import { huDate, huNumber } from "./format";

/*
 * Three separate MASTER TEMPLATES. Their structure (section order, numbering, tables,
 * signature/revision blocks, static notes) follows the approved historical company documents.
 * Historical VALUES are never used: every dynamic value comes from the current product dataset.
 */

export type Block =
  | { type: "heading"; text: string; level?: 1 | 2 }
  | { type: "title"; lines: string[] }
  | { type: "kv"; rows: KVRow[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "rich"; segments: Segment[]; field?: string; prefix?: Segment[]; suffix?: Segment[] }
  | { type: "para"; text: string; field?: string; prefix?: string }
  | { type: "note"; text: string }
  | { type: "side"; text: string }
  | { type: "sig"; cols: { role: string; field: string; name: string }[] }
  | { type: "rev"; rows: string[][] };

/** [label, value, fieldKey?] — fieldKey enables inline editing in the preview */
export type KVRow = [string, string] | [string, string, string];

export interface DocModel {
  kind: Destination;
  title: string;
  fileName: string;
  meta: KVRow[];
  blocks: Block[];
  /** values used by this document, for cross-document validation */
  used: Record<string, string>;
  /** slot values for the approved master Word template */
  fields: Record<string, string>;
  rich: Record<string, Segment[]>;
}

const AL_KEYS: [string, RegExp][] = [
  ["gluten", /glutén|búza|zab|rozs|árpa|tönköly|kamut/i],
  ["crustaceans", /rák/i],
  ["egg", /tojás/i],
  ["fish", /(^|\s)hal/i],
  ["peanut", /földimogyoró/i],
  ["soy", /szój/i],
  ["milk", /tej|laktóz/i],
  ["nuts", /dió|mandula|(?<!földi)mogyoró|kesu|pisztácia|pekán/i],
  ["celery", /zeller/i],
  ["mustard", /mustár/i],
  ["sesame", /szezám/i],
  ["sulphites", /kén-dioxid|szulfit/i],
  ["lupin", /csillagfürt/i],
  ["molluscs", /puhatestű/i],
  ["licorice", /édesgyökér/i],
];

export const DOC_TITLES: Record<Destination, string> = {
  sheet: "Gyártmánylap",
  spec: "Késztermék specifikáció",
  pack: "Szövegterv",
};

export type FieldClass =
  | "STATIC_STRUCTURE"
  | "DYNAMIC_SOURCE"
  | "CALCULATED"
  | "COMPANY_FIXED"
  | "REGULATORY"
  | "CONTROLLED_CATEGORY"
  | "MANUAL"
  | "APPROVAL_METADATA"
  | "UNCERTAIN";

export const FIELD_CLASS_LABELS: Record<FieldClass, string> = {
  STATIC_STRUCTURE: "Statikus szerkezet",
  DYNAMIC_SOURCE: "Forrásadat",
  CALCULATED: "Számított",
  COMPANY_FIXED: "Céges fix",
  REGULATORY: "Jogszabályi",
  CONTROLLED_CATEGORY: "Kategória",
  MANUAL: "Kézi",
  APPROVAL_METADATA: "Jóváhagyási adat",
  UNCERTAIN: "ELLENŐRIZENDŐ MEZŐTÍPUS",
};

/** Template map derived from the reference documents (structure only). */
export const TEMPLATE_MAPS: Record<Destination, [string, FieldClass][]> = {
  sheet: [
    ["GYÁRTMÁNYLAP cím", "STATIC_STRUCTURE"],
    ["Termék neve, leírás", "DYNAMIC_SOURCE"],
    ["Felelős személyek, aláírások", "APPROVAL_METADATA"],
    ["Érvénybe lépés dátuma, példány sorszáma", "APPROVAL_METADATA"],
    ["Felülvizsgálati megjegyzés", "STATIC_STRUCTURE"],
    ["I/1–I/2 Előállító, üzem, egészségügyi jel", "COMPANY_FIXED"],
    ["II/1 Forgalmazási megnevezés", "DYNAMIC_SOURCE"],
    ["II/2 Összetevők csökkenő sorrendben, %", "CALCULATED"],
    ["II/3 GMO nyilatkozat", "UNCERTAIN"],
    ["II/4 Gyártási műveletek, paraméterek", "COMPANY_FIXED"],
    ["Csomagolás (forma, zárás, anyag)", "DYNAMIC_SOURCE"],
    ["Tömeg", "DYNAMIC_SOURCE"],
    ["Tömeg tűrés", "UNCERTAIN"],
    ["III/1 Jogszabályi hivatkozások", "REGULATORY"],
    ["III/2 Mikrobiológiai, kémiai, fizikai jellemzők", "MANUAL"],
    ["Allergének", "CALCULATED"],
    ["Tápérték táblázat", "CALCULATED"],
    ["Tápérték meghatározás módszere", "STATIC_STRUCTURE"],
    ["Minőségmegőrzési időtartam", "MANUAL"],
    ["Tárolási feltételek", "CONTROLLED_CATEGORY"],
    ["Jelölés, gyártási azonosító", "COMPANY_FIXED"],
    ["Verziótörténet", "APPROVAL_METADATA"],
    ["Megőrzési megjegyzés", "STATIC_STRUCTURE"],
  ],
  spec: [
    ["1. Általános információk (kétnyelvű fejlécek)", "STATIC_STRUCTURE"],
    ["1.1 Termék név", "DYNAMIC_SOURCE"],
    ["1.2 SAP, 1.2.1 TARIC", "MANUAL"],
    ["1.3 Jogszabályi előírások", "REGULATORY"],
    ["1.4 Gyártó adatai", "COMPANY_FIXED"],
    ["1.5 Termékleírás, felhasználás, fogyasztói csoport", "DYNAMIC_SOURCE"],
    ["1.6 Csomagolás (egyedi, gyűjtő, raklap)", "DYNAMIC_SOURCE"],
    ["1.7 Raktározási feltételek", "CONTROLLED_CATEGORY"],
    ["1.8 Szállítási feltételek", "COMPANY_FIXED"],
    ["1.9 Minőségmegőrzési idő", "MANUAL"],
    ["1.10 Forgalmazási feltételek", "COMPANY_FIXED"],
    ["2.1 Termékösszetétel", "CALCULATED"],
    ["Tápérték", "CALCULATED"],
    ["2.2.1–2.2.5 Minőségi jellemzők", "MANUAL"],
    ["Tűrések", "UNCERTAIN"],
    ["Allergének", "CALCULATED"],
    ["Jóváhagyás", "APPROVAL_METADATA"],
  ],
  pack: [
    ["Minimális betűméret megjegyzés", "STATIC_STRUCTURE"],
    ["Front oldal / Hátoldal", "STATIC_STRUCTURE"],
    ["Terméknév, ízváltozat", "DYNAMIC_SOURCE"],
    ["Egy adag, energia front", "CALCULATED"],
    ["Referencia beviteli érték", "REGULATORY"],
    ["Jogszabályi megnevezés", "DYNAMIC_SOURCE"],
    ["Nettó tömeg + betűméret megjegyzés", "DYNAMIC_SOURCE"],
    ["Összetevők", "CALCULATED"],
    ["Nyomokban tartalmazhat", "MANUAL"],
    ["Állítások", "UNCERTAIN"],
    ["Tápérték táblázat 100 g / 1 adag", "CALCULATED"],
    ["Adagok száma", "MANUAL"],
    ["Tárolási / fogyaszthatósági szöveg", "REGULATORY"],
    ["Gyártó, cím, info vonal, web", "COMPANY_FIXED"],
    ["Vonalkód", "MANUAL"],
  ],
};

const DASH = "—";

export function buildDocs(p: Product, ds: Dataset, dict: DictionaryEntry[], s: Settings): Record<Destination, DocModel> {
  const b = ds.basics;
  const val = (d: Destination, k: string) => p.overrides[`doc.${d}.${k}`]?.value ?? b[k]?.display ?? "";
  const or = (x: string) => x || DASH;
  const name = b.productName.display || DASH;
  const weight = b.productWeight.display;
  const servingG = Number(String(b.servingSize.display).replace(/[^0-9.,]/g, "").replace(",", ".")) || ds.weightG || null;
  const n = (k: string) => ds.nutrition.find((x) => x.key === k)!;
  const ingText = ds.ingredientText;
  const regs = [
    b.legalRef.display,
    ...(p.files ?? []).flatMap((f) => f.regulatory.filter((r) => r.status === "ok").map((r) => r.identifier)),
  ].filter((x, i, a) => x && a.indexOf(x) === i);
  const byId = new Map(dict.map((d) => [d.id, d]));
  const sortedIngs = [...p.ingredients].sort((a, c) => (c.raw.quantity ?? 0) - (a.raw.quantity ?? 0));
  const ingRows = sortedIngs.map((i) => {
    const e = i.entryId ? byId.get(i.entryId) : undefined;
    return [e && i.status === "recognized" ? e.canonicalName : `${i.raw.name} (ismeretlen)`, i.raw.code || e?.materialCode || DASH, `${huNumber(i.percentage, 1)} %`];
  });
  const nutriRows = (withServing: boolean) => {
    const sv = withServing && servingG;
    const scale = (k: string) => {
      const x = n(k);
      if (!sv || !ds.weightG) return x.perServing?.display ?? "";
      return x.perServing?.display ?? "";
    };
    return [
      ["Energia", `${n("energyKj").per100.display} / ${n("energyKcal").per100.display}`, ...(sv ? [`${scale("energyKj")} / ${scale("energyKcal")}`] : [])],
      ...ds.nutrition.slice(2).map((x) => [x.key === "saturates" || x.key === "sugars" ? `– ${x.per100.label}` : x.per100.label, x.per100.display, ...(sv ? [x.perServing?.display ?? ""] : [])]),
    ];
  };
  const safe = (b.productName.display || "termek").replace(/[^\p{L}\p{N}]+/gu, "_");
  const meta: KVRow[] = [
    ["Termékazonosító", p.internalId],
    ["Receptverzió", p.recipeVersion],
    ["Dokumentumverzió", p.docVersion],
    ["Állapot", p.status === "approved" ? `Jóváhagyva – ${p.approvedBy ?? ""}` : "Nem jóváhagyott tervezet"],
  ];
  const revRows = p.history.slice(-6).map((h) => [h.version, huDate(h.date), h.note]);
  const allergenText = ds.allergens.length ? ds.allergens.join(", ") : "Nem tartalmaz jelölésköteles allergént.";
  const used = (d: Destination): Record<string, string> => ({
    "Terméknév": val(d, "productName"),
    "Termékleírás": val(d, "description"),
    "Tömeg": val(d, "productWeight"),
    "Összetevők": ingText,
    "Energia /100 g": `${n("energyKj").per100.display} / ${n("energyKcal").per100.display}`,
    "Allergének": allergenText,
    "Tárolás": val(d, "storage"),
    "Minőségmegőrzés": val(d, "shelfLife"),
    "Gyártó": val(d, "manufacturer"),
    ...(d !== "pack" ? { "Jogszabályok": regs.join(", ") } : {}),
  });

  /* ---------------- GYÁRTMÁNYLAP MASTER ---------------- */
  const sheet: DocModel = {
    kind: "sheet",
    title: DOC_TITLES.sheet,
    fileName: `${safe}_Gyartmanylap_${p.docVersion}.docx`,
    meta,
    used: used("sheet"),
    fields: {},
    rich: {},
    blocks: [
      { type: "title", lines: ["GYÁRTMÁNYLAP", name.toUpperCase(), val("sheet", "description")] },
      {
        type: "sig",
        cols: [
          { role: "Gyártmánylap elkészítéséért felelős személy:", field: "preparedBy", name: val("sheet", "preparedBy") },
          { role: "Az élelmiszer előállításáért szakmailag felelős személy:", field: "responsible", name: val("sheet", "responsible") },
          { role: "Jóváhagyó:", field: "approver", name: val("sheet", "approver") || (p.approvedBy ?? "") },
        ],
      },
      { type: "kv", rows: [["Érvénybe lépés dátuma", or(val("sheet", "effectiveDate")), "effectiveDate"], ["Érvényesség", "visszavonásig"], ["Példány sorszáma", "1."]] },
      { type: "note", text: "E dokumentum felülvizsgálata évente egyszer és a receptúra módosításoknak megfelelően történik. Kérem, hogy nyomtatott példányának érvényességét használatba vétel előtt ellenőrizze!" },
      { type: "heading", text: "Az élelmiszer-előállítóra vonatkozó azonosító adatok" },
      { type: "kv", rows: [
        ["I/1. Az élelmiszer-előállító vállalkozás neve és székhelyének címe", or(val("sheet", "manufacturer")), "manufacturer"],
        ["I/2. Az előállítás helye", or(val("sheet", "plantName")), "plantName"],
        ["Üzem címe", or(val("sheet", "plantAddress")), "plantAddress"],
        ["Az üzem egészségügyi jele", or(val("sheet", "healthMark")), "healthMark"],
      ] },
      { type: "heading", text: "Az élelmiszer előállításával kapcsolatos adatok" },
      { type: "kv", rows: [
        ["II/1. Az élelmiszer forgalomba hozatala során használt megnevezése", or(val("sheet", "legalName") || val("sheet", "description")), "legalName"],
      ] },
      { type: "heading", text: "II/2. Összetevők, előállítás kori tömegük csökkenő sorrendjében", level: 2 },
      { type: "rich", segments: ds.ingredientSegments, field: "ingredientText" },
      { type: "table", head: ["Összetevő", "Anyagkód", "Arány"], rows: ingRows },
      { type: "kv", rows: [
        ["II/3. Géntechnológiával módosított összetevő", or(val("sheet", "gmoStatement")), "gmoStatement"],
        ["II/4. Az eltarthatóságot, biztonságot meghatározó műveletek és paramétereik", or(val("sheet", "processDescription")), "processDescription"],
      ] },
      { type: "heading", text: "A termék csomagolása", level: 2 },
      { type: "kv", rows: [
        ["A csomagolás formája", or(val("sheet", "packagingForm") || val("sheet", "packaging")), "packagingForm"],
        ["A csomagolóanyag típusa", or(val("sheet", "packagingMaterial")), "packagingMaterial"],
        ["Tömeg", or(weight), "productWeight"],
        ["Tömeg tűrés", or(val("sheet", "weightTolerance")), "weightTolerance"],
      ] },
      { type: "heading", text: "A termék élelmiszer-biztonsági, minőségi jellemzői" },
      { type: "heading", text: "III/1. Jogszabályi előírások", level: 2 },
      { type: "table", head: ["Jogszabály", "Állapot"], rows: regs.length ? regs.map((r) => [r, "Ellenőrzött"]) : [[DASH, ""]] },
      { type: "heading", text: "III/2. Fizikai, kémiai, mikrobiológiai jellemzők", level: 2 },
      { type: "kv", rows: [
        ["III/2/1. Mikrobiológiai jellemzők", or(val("sheet", "micro")), "micro"],
        ["III/2/2. Kémiai élelmiszerbiztonsági jellemzők", or(val("sheet", "chemical")), "chemical"],
        ["III/2/3. Fizikai, összetételi jellemzők", or(val("sheet", "physical")), "physical"],
        ["Elfogadhatósági tartomány", or(b.acceptanceRange.display), "acceptanceRange"],
        ["Érzékszervi jellemzők", or(val("sheet", "sensory")), "sensory"],
        ["Allergének", allergenText, "allergenList"],
      ] },
      { type: "heading", text: "Tápérték", level: 2 },
      { type: "table", head: ["Átlagos tápérték", "100 g"], rows: nutriRows(false) },
      { type: "note", text: "A tápérték adatok meghatározásának módszere: az összetételből számolva." },
      { type: "kv", rows: [
        ["Minőségmegőrzési / fogyaszthatósági időtartam", or(val("sheet", "shelfLife")), "shelfLife"],
        ["Tárolási feltételek", or(`${b.storageMode.display}${val("sheet", "storage") ? ", " + val("sheet", "storage") : ""}`), "storage"],
        ["Az élelmiszer jelölése", or(val("sheet", "labelling")), "labelling"],
      ] },
      { type: "rev", rows: revRows },
      { type: "note", text: "Megőrzendő a gyártás megszüntetését követő 3 évig!" },
    ],
  };

  /* ---------------- KÉSZTERMÉK SPECIFIKÁCIÓ MASTER ---------------- */
  const spec: DocModel = {
    kind: "spec",
    title: DOC_TITLES.spec,
    fileName: `${safe}_Kesztermek_specifikacio_${p.docVersion}.docx`,
    meta,
    used: used("spec"),
    fields: {},
    rich: {},
    blocks: [
      { type: "heading", text: "1. Általános információk / General information" },
      { type: "kv", rows: [
        ["1.1. Termék név / Name of product", name, "productName"],
        ["1.2. Azonosítószám (SAP) / Number of identity (SAP)", or(val("spec", "sapCode")), "sapCode"],
        ["1.2.1. TARIC kód / TARIC code", or(val("spec", "taricCode")), "taricCode"],
        ["1.3. Jogszabályi előírások / Legal requirements", or(regs.join("; ")), "legalRef"],
        ["1.4.1. Gyártó üzem megnevezése / Name of producer plant", or(val("spec", "plantName") || val("spec", "manufacturer")), "plantName"],
        ["1.4.2. Gyártó üzem címe / Address of producer plant", or(`${val("spec", "plantAddress")}${val("spec", "healthMark") ? " " + val("spec", "healthMark") : ""}`), "plantAddress"],
        ["1.5. Termék leírása / General description", or(val("spec", "description")), "description"],
        ["1.5.1. Ajánlott felhasználási terület / Application", or(val("spec", "recommendedUse")), "recommendedUse"],
        ["1.5.2. Ajánlott fogyasztói csoport / Consuming group", or(val("spec", "consumerGroup")), "consumerGroup"],
      ] },
      { type: "heading", text: "1.6. Csomagolás / Packaging", level: 2 },
      { type: "kv", rows: [
        ["1.6.1. Egyedi (elsődleges) csomagolás / Primary packaging", or(val("spec", "packagingMaterial") || val("spec", "packaging")), "packagingMaterial"],
        ["Nettó tömeg / Net weight", or(weight), "productWeight"],
        ["1.6.2. Gyűjtő (másodlagos) csomagolás / Secondary packaging", or(val("spec", "secondaryPackaging")), "secondaryPackaging"],
        ["1.6.3. Raklap csomagolás / Pallet", or(val("spec", "palletPackaging")), "palletPackaging"],
        ["1.6.4. Azonosítás és jelölés / Identification", or(val("spec", "labelling")), "labelling"],
      ] },
      { type: "kv", rows: [
        ["1.7. Raktározási feltételek / Storage conditions", or(`${b.storageMode.display}${val("spec", "storage") ? ", " + val("spec", "storage") : ""}`), "storage"],
        ["1.8. Szállítási feltételek / Transport conditions", or(val("spec", "transport")), "transport"],
        ["1.9. Minőségmegőrzési idő / Shelf life", or(val("spec", "shelfLife")), "shelfLife"],
        ["1.10. Forgalmazási feltételek / Distribution conditions", or(val("spec", "distributionConditions")), "distributionConditions"],
      ] },
      { type: "heading", text: "2. Késztermék specifikáció / Specification of end product" },
      { type: "heading", text: "2.1. Termékösszetétel / Composition", level: 2 },
      { type: "rich", segments: ds.ingredientSegments, field: "ingredientText" },
      { type: "para", text: allergenText, field: "allergenList", prefix: "Allergének / Allergens: " },
      { type: "table", head: ["Átlagos tápérték / Nutrition", "100 g"], rows: nutriRows(false) },
      { type: "heading", text: "2.2. Minőségi jellemzők / Quality parameters", level: 2 },
      { type: "kv", rows: [
        ["2.2.1. Fizikai jellemzők / Physical", or(val("spec", "physical")), "physical"],
        ["2.2.2. Kémiai jellemzők / Chemical", or(val("spec", "chemical")), "chemical"],
        ["2.2.3. Mikrobiológiai jellemzők / Microbiological", or(val("spec", "micro")), "micro"],
        ["2.2.4. Érzékszervi jellemzők / Sensory", or(val("spec", "sensory")), "sensory"],
        ["2.2.5. Élelmiszerbiztonsági kritériumok / Food safety", or(val("spec", "foodSafety")), "foodSafety"],
        ["Elfogadhatósági tartomány / Tolerance", or(b.acceptanceRange.display), "acceptanceRange"],
      ] },
      { type: "heading", text: "Jóváhagyás / Approval", level: 2 },
      { type: "kv", rows: [["Készítette / Prepared by", p.createdBy], ["Ellenőrizte / Checked by", or(p.reviewedBy ?? "")], ["Jóváhagyta / Approved by", or(p.approvedBy ?? "")], ["Dátum / Date", huDate(p.updatedAt)]] },
    ],
  };

  /* ---------------- SZÖVEGTERV / LEGAL TEXT MASTER ---------------- */
  const sv = servingG ? `${huNumber(servingG, 0)} g` : "";
  const pack: DocModel = {
    kind: "pack",
    title: DOC_TITLES.pack,
    fileName: `${safe}_Szovegterv_${p.docVersion}.docx`,
    meta,
    used: used("pack"),
    fields: {},
    rich: {},
    blocks: [
      { type: "note", text: "Minimális betűméret (x) = 1,2 mm, kivéve nettó tömeg / Minimal letter size (x) = 1,2 mm, except net weight" },
      { type: "side", text: "Front oldal / Front side" },
      { type: "heading", text: val("pack", "marketingName") || name },
      { type: "para", text: val("pack", "variant"), field: "variant" },
      ...(sv ? [{ type: "para" as const, text: `${n("energyKj").perServing?.display ?? ""} / ${n("energyKcal").perServing?.display ?? ""}`, prefix: `Egy adag: ${sv} – ` }] : []),
      { type: "para", text: `${n("energyKj").per100.display} / ${n("energyKcal").per100.display}`, prefix: "100 g-ban: " },
      { type: "note", text: "¹Referencia beviteli érték egy átlagos felnőtt számára (8400 kJ / 2000 kcal)." },
      { type: "side", text: "Hátoldal / Back side" },
      { type: "heading", text: val("pack", "marketingName") || name },
      { type: "para", text: or(val("pack", "legalName") || val("pack", "description")), field: "legalName" },
      { type: "para", text: or(weight), field: "productWeight", prefix: "Nettó tömeg: " },
      { type: "note", text: "*Tömeg min. 2 mm betűméret, egy látómezőben a megnevezéssel." },
      { type: "rich", segments: ds.ingredientSegments, field: "ingredientText", prefix: [{ text: "Összetevők: ", emph: true }], suffix: [{ text: "." }] },
      { type: "para", text: val("pack", "mayContain"), field: "mayContain" },
      { type: "para", text: val("pack", "claims"), field: "claims" },
      { type: "table", head: ["Átlagos tápérték", "100 g", ...(sv ? [`1 adag (${sv})`] : [])], rows: nutriRows(!!sv) },
      { type: "para", text: val("pack", "servingsPerPack"), field: "servingsPerPack", prefix: "A csomag ennyi adagot tartalmaz: " },
      { type: "para", text: `${b.bestBeforeWording.display} (nap, hónap) a csomagoláson jelölt időpontig${val("pack", "storage") ? ", " + val("pack", "storage") : ""}`, field: "storage" },
      { type: "para", text: or(val("pack", "manufacturer")), field: "manufacturer", prefix: "Gyártó: " },
      { type: "para", text: val("pack", "infoLine"), field: "infoLine", prefix: "Info vonal: " },
      { type: "para", text: val("pack", "website"), field: "website" },
      { type: "para", text: val("pack", "barcode"), field: "barcode", prefix: "Vonalkód: " },
    ],
  };
  /* ---------------- MASTER TEMPLATE SLOT VALUES (current dataset only) ---------------- */
  const pair = (a: string, c: string) => `${n(a).per100.display}\n${n(c).per100.display}`;
  const nut = {
    n_energy: `${n("energyKj").per100.display}\n${n("energyKcal").per100.display}`,
    n_fat_sat: pair("fat", "saturates"),
    n_carb_sug: pair("carbohydrate", "sugars"),
    n_tfa: DASH,
    n_protein: n("protein").per100.display,
    n_fibre: n("fibre").per100.display,
    n_salt: n("salt").per100.display,
  };
  const mayC = val("pack", "mayContain");
  const al: Record<string, string> = {};
  for (const [k, re] of AL_KEYS) al[`al_${k}`] = ds.allergens.some((a) => re.test(a)) ? "+" : re.test(mayC) ? "?" : "-";
  const rev: Record<string, string> = {};
  for (let i = 0; i < 3; i++) {
    const r = revRows[i];
    rev[`rev${i}_v`] = r?.[0] ?? "";
    rev[`rev${i}_d`] = r?.[1] ?? "";
    rev[`rev${i}_n`] = r?.[2] ?? "";
  }
  const storageFull = (d: Destination) => or(`${b.storageMode.display}${val(d, "storage") ? ", " + val(d, "storage") : ""}`);
  const today = huDate(p.updatedAt);
  const common = (d: Destination) => ({
    productName: name,
    manufacturerName: or(val(d, "manufacturer").split("\n")[0]),
    effectiveDate: or(val(d, "effectiveDate")),
    docVersion: p.docVersion,
    date: today,
  });
  sheet.fields = {
    ...common("sheet"), ...nut, ...al, ...rev,
    productNameUpper: name.toUpperCase(),
    description: or(val("sheet", "description")),
    preparedBy: or(val("sheet", "preparedBy")),
    responsible: or(val("sheet", "responsible")),
    approver: or(val("sheet", "approver") || (p.approvedBy ?? "")),
    manufacturer: or(val("sheet", "manufacturer")),
    plantName: or(val("sheet", "plantName")),
    plantAddress: or(val("sheet", "plantAddress")),
    healthMark: or(val("sheet", "healthMark")),
    legalName: or(val("sheet", "legalName") || val("sheet", "description")),
    ingredientsList: or(sortedIngs.length ? ingRows.map((r) => `${r[0]} ${r[2].replace(" %", "%")}`).join(",\n") : ""),
    gmoStatement: or(val("sheet", "gmoStatement")),
    processDescription: or(val("sheet", "processDescription")),
    packagingForm: or(val("sheet", "packagingForm") || val("sheet", "packaging")),
    packagingMethod: or(val("sheet", "packagingMethod")),
    packagingClosure: or(val("sheet", "packagingClosure")),
    packagingMaterial: or(val("sheet", "packagingMaterial")),
    productWeight: or(weight),
    weightTolerance: val("sheet", "weightTolerance"),
    regs: or(regs.join("\n")),
    micro: or(val("sheet", "micro")),
    physical: or(val("sheet", "physical")),
    sensory: or(val("sheet", "sensory")),
    shelfLife: or(val("sheet", "shelfLife")),
    storage: storageFull("sheet"),
    labelling: or(val("sheet", "labelling")),
  };
  spec.fields = {
    ...common("spec"), ...nut, ...al,
    sapCode: or(val("spec", "sapCode")),
    taricCode: or(val("spec", "taricCode")),
    regs: or(regs.join("\n")),
    plantName: or(val("spec", "plantName") || val("spec", "manufacturer")),
    plantAddressMark: or(`${val("spec", "plantAddress")}${val("spec", "healthMark") ? "  " + val("spec", "healthMark") : ""}`),
    description: or(val("spec", "description")),
    recommendedUse: or(val("spec", "recommendedUse")),
    consumerGroup: or(val("spec", "consumerGroup")),
    packagingMaterial: or(val("spec", "packagingMaterial") || val("spec", "packaging")),
    secondaryPackaging: or(val("spec", "secondaryPackaging")),
    caseNet: or(val("spec", "caseNet")),
    caseGross: or(val("spec", "caseGross")),
    caseUnits: or(val("spec", "caseUnits")),
    palletPackaging: or(val("spec", "palletPackaging")),
    storage: storageFull("spec"),
    storageTemp: or(val("spec", "storageTemp")),
    storageHumidity: or(val("spec", "storageHumidity")),
    transport: or(val("spec", "transport")),
    transportTemp: or(val("spec", "transportTemp")),
    transportHumidity: or(val("spec", "transportHumidity")),
    shelfLife: or(val("spec", "shelfLife")),
    distributionConditions: or(val("spec", "distributionConditions")),
    ingredientText: or(ingText),
    weightValue: or(weight.replace(/\s*g$/i, "")),
    weightTolerance: or(val("spec", "weightTolerance")),
    fatValue: n("fat").per100.display.replace(/\s*g$/i, ""),
    acceptanceRange: or(b.acceptanceRange.display),
    micro: or(val("spec", "micro")),
    sensory: or(val("spec", "sensory")),
    preparedBy: or(p.createdBy),
    reviewedBy: or(p.reviewedBy ?? ""),
    reviewDate: p.reviewedBy ? today : "",
  };
  const ps: Record<string, string> = {};
  for (const k of ["fat", "saturates", "carbohydrate", "sugars", "protein", "salt"]) {
    ps[`p100_${k}`] = n(k).per100.display;
    ps[`psv_${k}`] = n(k).perServing?.display ?? DASH;
  }
  const kjServ = n("energyKj").perServing;
  const kjServNum = Number(String(kjServ?.display ?? "").replace(/[^0-9,.]/g, "").replace(",", "."));
  pack.fields = {
    ...common("pack"), ...ps,
    marketingName: val("pack", "marketingName") || name,
    variant: val("pack", "variant"),
    servingSize: or(sv),
    frontServingEnergy: kjServ ? `${kjServ.display}/ ${n("energyKcal").perServing?.display ?? ""}` : DASH,
    riPct: kjServNum ? `${Math.round((kjServNum / 8400) * 100)}%` : DASH,
    energy100: `${n("energyKj").per100.display}/ ${n("energyKcal").per100.display}`,
    p100_energy: `${n("energyKj").per100.display}\n${n("energyKcal").per100.display}`,
    psv_energy: kjServ ? `${kjServ.display}/ ${n("energyKcal").perServing?.display ?? ""}` : DASH,
    legalName: or(val("pack", "legalName") || val("pack", "description")),
    productWeight: or(weight),
    mayContain: mayC,
    claims: val("pack", "claims"),
    servingsPerPack: or(val("pack", "servingsPerPack")),
    storageText: `${b.bestBeforeWording.display} (nap, hónap) a csomagoláson jelölt időpontig${val("pack", "storage") ? ", " + val("pack", "storage") : ""}`.replace(/\.*$/, ".") ,
    manufacturer: or(val("pack", "manufacturer")),
    healthMarkNo: (val("pack", "healthMark").match(/\d+/)?.[0]) ?? DASH,
    plantAddress: or(val("pack", "plantAddress")),
    infoLine: or(val("pack", "infoLine")),
    website: val("pack", "website"),
    barcode: or(val("pack", "barcode")),
  };
  pack.rich = { ingredientsRich: [{ text: "Összetevők: ", emph: true }, ...ds.ingredientSegments, { text: "." }] };
  return { sheet, spec, pack };
}

/** Cross-document validation: differing fields only. */
export function crossCheck(docs: Record<Destination, DocModel>) {
  const keys = Object.keys(docs.sheet.used);
  return keys
    .map((k) => ({ field: k, sheet: docs.sheet.used[k], spec: docs.spec.used[k], pack: docs.pack.used[k] }))
    .filter((r) => {
      const vals = [r.sheet, r.spec, r.pack].filter((v) => v !== undefined);
      return new Set(vals).size > 1;
    });
}
