import JSZip from "jszip";
import { idbAvailable, idbGet, idbPut, STORES } from "@/lib/idb";
import type { Destination } from "./engine";
import type { Segment } from "./engine";

/*
 * TEMPLATE-BASED WORD GENERATION
 * APPROVED MASTER WORD TEMPLATE + CURRENT VALIDATED PRODUCT DATA = FINAL WORD DOCUMENT
 *
 * The three master files in /public/templates were produced from the approved historical company
 * documents: page size, margins, fonts, tables, merged cells, borders, headers, footers, page numbering,
 * signature and revision blocks are kept byte-for-byte. Every historical VALUE was replaced by a
 * {{field}} slot. Nothing is filled from the historical documents — only from the RecipeFlow dataset.
 */

export const MASTER_FILES: Record<Destination, { id: string; file: string }> = {
  sheet: { id: "GYL_MASTER", file: "GYL_MASTER.docx" },
  spec: { id: "SPEC_MASTER", file: "SPEC_MASTER.docx" },
  pack: { id: "LEGAL_TEXT_MASTER", file: "LEGAL_TEXT_MASTER.docx" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Rich (bold allergen) replacement: replaces the whole run carrying the token. */
function replaceRich(xml: string, token: string, segs: Segment[]) {
  const re = new RegExp(
    `<w:r>(<w:rPr>(?:(?!</w:rPr>).)*</w:rPr>)?<w:t[^>]*>\\{\\{${token}\\}\\}</w:t></w:r>`,
    "s",
  );
  return xml.replace(re, (_m, rpr: string | undefined) => {
    const base = rpr ?? "<w:rPr></w:rPr>";
    const bold = base.includes("<w:b/>")
      ? base
      : base.match(/<w:rFonts[^>]*\/>/)
        ? base.replace(/(<w:rFonts[^>]*\/>)/, "$1<w:b/>")
        : base.replace(/(<w:rPr>(?:<w:rStyle[^>]*\/>)?)/, "$1<w:b/>");
    return segs
      .filter((s) => s.text)
      .map(
        (s) => `<w:r>${s.emph ? bold : base}<w:t xml:space="preserve">${esc(s.text)}</w:t></w:r>`,
      )
      .join("");
  });
}

function fillXml(xml: string, fields: Record<string, string>, rich: Record<string, Segment[]>) {
  for (const [k, segs] of Object.entries(rich)) xml = replaceRich(xml, k, segs);
  return xml.replace(
    /<w:t([^>]*)>([^<]*\{\{[A-Za-z0-9_]+\}\}[^<]*)<\/w:t>/g,
    (_m, attrs: string, text: string) => {
      const filled = text.replace(
        /\{\{([A-Za-z0-9_]+)\}\}/g,
        (_x, key: string) => fields[key] ?? "",
      );
      const parts = filled.split("\n").map(esc);
      return `<w:t xml:space="preserve">${parts.join('</w:t><w:br/><w:t xml:space="preserve">')}</w:t>`;
    },
  );
}

/** Bump when the master .docx files in /public/templates are regenerated. */
export const TEMPLATE_VERSION = "2026-09-24.1";

interface StoredTemplate {
  version: string;
  data: ArrayBuffer;
  savedAt: string;
}

/**
 * Loads a master template. Offline-first: the approved master is kept in IndexedDB on this
 * device. The network copy is only used once (first setup / new template version) and then stored.
 */
export async function loadMaster(kind: Destination): Promise<ArrayBuffer> {
  const id = MASTER_FILES[kind].id;
  if (idbAvailable()) {
    const rec = await idbGet<StoredTemplate>(STORES.templates, id).catch(() => undefined);
    if (rec?.data && rec.version === TEMPLATE_VERSION) return rec.data;
    try {
      const data = await fetchMaster(kind);
      await idbPut(STORES.templates, id, {
        version: TEMPLATE_VERSION,
        data,
        savedAt: new Date().toISOString(),
      } satisfies StoredTemplate).catch(() => {});
      return data;
    } catch (e) {
      // Offline with an older stored version: still better than nothing.
      if (rec?.data) return rec.data;
      throw e;
    }
  }
  return fetchMaster(kind);
}

async function fetchMaster(kind: Destination) {
  const res = await fetch(`/templates/${MASTER_FILES[kind].file}`);
  if (!res.ok) throw new Error(`Hiányzó mestersablon: ${MASTER_FILES[kind].id}`);
  return res.arrayBuffer();
}

/** Stores all three masters locally (called on app start) so Word export works without network. */
export async function ensureMasterTemplates() {
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(MASTER_FILES) as Destination[]) {
    out[MASTER_FILES[k].id] = await loadMaster(k).then(
      () => true,
      () => false,
    );
  }
  return out;
}

export async function templatesStoredLocally() {
  if (!idbAvailable()) return false;
  for (const k of Object.keys(MASTER_FILES) as Destination[]) {
    const r = await idbGet<StoredTemplate>(STORES.templates, MASTER_FILES[k].id).catch(
      () => undefined,
    );
    if (!r?.data) return false;
  }
  return true;
}

export async function fillMaster(
  kind: Destination,
  fields: Record<string, string>,
  rich: Record<string, Segment[]> = {},
) {
  const zip = await JSZip.loadAsync(await loadMaster(kind));
  const parts = Object.keys(zip.files).filter((n) =>
    /^word\/(document|header\d+|footer\d+)\.xml$/.test(n),
  );
  for (const n of parts) {
    const xml = await zip.file(n)!.async("string");
    zip.file(n, fillXml(xml, fields, rich));
  }
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

/** Field map of each master (slot → meaning). Shown on the Sablonok page. */
export const MASTER_FIELD_MAPS: Record<Destination, string[]> = {
  sheet: [
    "productNameUpper",
    "description",
    "preparedBy",
    "responsible",
    "approver",
    "effectiveDate",
    "manufacturer",
    "manufacturerName",
    "plantName",
    "plantAddress",
    "healthMark",
    "legalName",
    "ingredientsList",
    "gmoStatement",
    "processDescription",
    "packagingForm",
    "packagingMethod",
    "packagingClosure",
    "packagingMaterial",
    "productWeight",
    "weightTolerance",
    "regs",
    "micro",
    "al_*",
    "physical",
    "sensory",
    "n_*",
    "shelfLife",
    "storage",
    "labelling",
    "rev*_v/d/n",
    "productName",
  ],
  spec: [
    "productName",
    "sapCode",
    "taricCode",
    "regs",
    "plantName",
    "plantAddressMark",
    "description",
    "recommendedUse",
    "consumerGroup",
    "packagingMaterial",
    "secondaryPackaging",
    "caseNet",
    "caseGross",
    "caseUnits",
    "palletPackaging",
    "storage",
    "storageTemp",
    "storageHumidity",
    "transport",
    "transportTemp",
    "transportHumidity",
    "shelfLife",
    "distributionConditions",
    "ingredientText",
    "n_*",
    "weightValue",
    "weightTolerance",
    "fatValue",
    "acceptanceRange",
    "micro",
    "sensory",
    "al_*",
    "preparedBy",
    "reviewedBy",
    "date",
    "reviewDate",
    "manufacturerName",
    "effectiveDate",
    "docVersion",
  ],
  pack: [
    "marketingName",
    "variant",
    "servingSize",
    "frontServingEnergy",
    "riPct",
    "energy100",
    "legalName",
    "productWeight",
    "ingredientsRich",
    "mayContain",
    "claims",
    "p100_*",
    "psv_*",
    "servingsPerPack",
    "storageText",
    "manufacturer",
    "healthMarkNo",
    "plantAddress",
    "infoLine",
    "website",
    "barcode",
    "date",
  ],
};
