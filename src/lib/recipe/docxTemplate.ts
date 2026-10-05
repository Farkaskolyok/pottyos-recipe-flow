import JSZip from "jszip";
import { idbAvailable, idbGet, idbPut, STORES } from "@/lib/idb";
import type { Destination } from "./engine";
import type { Segment } from "./engine";
import type { SigImage, SlotKey } from "./signatures";

function drawing(rid: string, id: number, im: SigImage, name: string) {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${im.cx}" cy="${im.cy}"/><wp:docPr id="${id}" name="${name}" descr="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${im.cx}" cy="${im.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

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
export const TEMPLATE_VERSION = "2026-09-25.1";

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
  opts: { draft?: boolean; signatures?: Partial<Record<SlotKey, SigImage>> } = {},
) {
  const zip = await JSZip.loadAsync(await loadMaster(kind));
  const sigs = opts.draft ? {} : (opts.signatures ?? {});
  let relAdd = "";
  let docXml = await zip.file("word/document.xml")!.async("string");
  let nId = 9000;
  for (const k of ["CREATED", "CHECKED", "APPROVED"] as SlotKey[]) {
    const re = new RegExp(
      `<w:r>(?:(?!</w:r>).)*?\\{\\{${k}_SIGNATURE\\}\\}(?:(?!</w:r>).)*?</w:r>`,
      "s",
    );
    const im = sigs[k];
    if (!im || !re.test(docXml)) continue;
    const rid = `rIdSig${k}`;
    const media = `media/signature_${k.toLowerCase()}.jpg`;
    zip.file(`word/${media}`, im.bytes);
    relAdd += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${media}"/>`;
    docXml = docXml.replace(re, drawing(rid, nId++, im, `Aláírás ${k}`));
  }
  zip.file("word/document.xml", docXml);
  if (relAdd) {
    const rp = "word/_rels/document.xml.rels";
    zip.file(
      rp,
      (await zip.file(rp)!.async("string")).replace(
        "</Relationships>",
        relAdd + "</Relationships>",
      ),
    );
    const cp = "[Content_Types].xml";
    const ct = await zip.file(cp)!.async("string");
    if (!/Extension="jpg"/i.test(ct))
      zip.file(
        cp,
        ct
          .replace("<Types", "<Types")
          .replace(/(<Types[^>]*>)/, '$1<Default Extension="jpg" ContentType="image/jpeg"/>'),
      );
  }
  const parts = Object.keys(zip.files).filter((n) =>
    /^word\/(document|header\d+|footer\d+)\.xml$/.test(n),
  );
  for (const n of parts) {
    const xml = await zip.file(n)!.async("string");
    let out = fillXml(xml, fields, rich);
    if (opts.draft && n === "word/document.xml")
      out = out.replace(
        /<w:body>/,
        '<w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="C00000"/><w:sz w:val="32"/></w:rPr><w:t>TERVEZET</w:t></w:r></w:p>',
      );
    zip.file(n, out);
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

/** Exact placeholder set of each master: all must exist, no others are allowed. */
const AL = [
  "celery",
  "crustaceans",
  "egg",
  "fish",
  "gluten",
  "lupin",
  "milk",
  "molluscs",
  "mustard",
  "nuts",
  "peanut",
  "sesame",
  "soy",
  "sulphites",
].map((x) => `al_${x}`);
const N = ["n_carb_sug", "n_energy", "n_fat_sat", "n_fibre", "n_protein", "n_salt", "n_tfa"];
const P = ["carbohydrate", "energy", "fat", "protein", "salt", "saturates", "sugars"];
export const MASTER_PLACEHOLDERS: Record<Destination, string[]> = {
  sheet: [
    ...AL,
    ...N,
    "APPROVED_DATE",
    "APPROVED_SIGNATURE",
    "CREATED_DATE",
    "CREATED_SIGNATURE",
    "approver",
    "description",
    "effectiveDate",
    "gmoStatement",
    "healthMark",
    "ingredientsList",
    "labelling",
    "legalName",
    "manufacturer",
    "manufacturerName",
    "micro",
    "packagingClosure",
    "packagingForm",
    "packagingMaterial",
    "packagingMethod",
    "physical",
    "plantAddress",
    "plantName",
    "preparedBy",
    "processDescription",
    "productName",
    "productNameUpper",
    "productWeight",
    "regs",
    "responsible",
    "rev0_d",
    "rev0_n",
    "rev0_v",
    "rev1_d",
    "rev1_n",
    "rev1_v",
    "rev2_d",
    "rev2_n",
    "rev2_v",
    "sensory",
    "shelfLife",
    "storage",
    "weightTolerance",
  ],
  spec: [
    ...AL,
    "al_licorice",
    ...N,
    "CHECKED_SIGNATURE",
    "CREATED_DATE",
    "CREATED_SIGNATURE",
    "acceptanceRange",
    "caseGross",
    "caseNet",
    "caseUnits",
    "consumerGroup",
    "date",
    "description",
    "distributionConditions",
    "docVersion",
    "effectiveDate",
    "fatValue",
    "ingredientText",
    "manufacturerName",
    "micro",
    "packagingMaterial",
    "palletPackaging",
    "plantAddressMark",
    "plantName",
    "preparedBy",
    "productName",
    "recommendedUse",
    "regs",
    "reviewDate",
    "reviewedBy",
    "sapCode",
    "secondaryPackaging",
    "sensory",
    "shelfLife",
    "storage",
    "storageHumidity",
    "storageTemp",
    "taricCode",
    "transport",
    "transportHumidity",
    "transportTemp",
    "weightTolerance",
    "weightValue",
  ],
  pack: [
    ...P.map((x) => `p100_${x}`),
    ...P.map((x) => `psv_${x}`),
    "barcode",
    "claims",
    "date",
    "energy100",
    "frontServingEnergy",
    "healthMarkNo",
    "infoLine",
    "ingredientsRich",
    "legalName",
    "manufacturer",
    "marketingName",
    "mayContain",
    "plantAddress",
    "productWeight",
    "riPct",
    "servingSize",
    "servingsPerPack",
    "storageText",
    "variant",
    "website",
  ],
};
