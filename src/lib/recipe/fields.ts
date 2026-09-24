// Field registry: every field knows its edit type, allowed options and permission.

export type EditType = "TEXT" | "LONGTEXT" | "NUMBER" | "PERCENTAGE" | "DATE" | "DROPDOWN" | "MULTISELECT" | "BOOLEAN" | "READ_ONLY";
export type FieldKind = "normal" | "company" | "regulatory";

export interface FieldDef {
  key: string;
  label: string;
  editType: EditType;
  unit?: string;
  categoryId?: string;
  kind?: FieldKind;
  /** who may edit: "user" = everyone, "admin" = admin only */
  permission?: "user" | "admin";
}

export const DEFAULT_CATEGORIES: Record<string, { label: string; options: string[] }> = {
  storageMode: { label: "Tárolási mód", options: ["Hűtve tárolandó", "Fagyasztva tárolandó", "Szobahőmérsékleten tárolandó"] },
  texture: { label: "Állag", options: ["Krémes", "Lágy", "Szilárd", "Folyékony"] },
  bestBefore: { label: "Minőségmegőrzési megfogalmazás", options: ["Minőségét megőrzi:", "Fogyasztható:"] },
  allergens: {
    label: "Allergének",
    options: ["glutén", "rákfélék", "tojás", "hal", "földimogyoró", "szója", "tej", "diófélék", "zeller", "mustár", "szezámmag", "kén-dioxid", "csillagfürt", "puhatestűek"],
  },
};

const F = (d: FieldDef) => d;

export const FIELDS: Record<string, FieldDef> = Object.fromEntries(
  [
    F({ key: "productName", label: "Terméknév", editType: "TEXT" }),
    F({ key: "marketingName", label: "Termék kereskedelmi neve", editType: "TEXT" }),
    F({ key: "description", label: "Termékleírás", editType: "LONGTEXT" }),
    F({ key: "recipeVersion", label: "Receptverzió", editType: "READ_ONLY" }),
    F({ key: "productWeight", label: "Nettó tömeg", editType: "NUMBER", unit: "g" }),
    F({ key: "servingSize", label: "Adagméret", editType: "NUMBER", unit: "g" }),
    F({ key: "losses", label: "Gyártási veszteség", editType: "PERCENTAGE" }),
    F({ key: "totalSolids", label: "Szárazanyag", editType: "PERCENTAGE" }),
    F({ key: "acceptanceRange", label: "Elfogadhatósági tartomány", editType: "PERCENTAGE", kind: "company" }),
    F({ key: "texture", label: "Állag", editType: "DROPDOWN", categoryId: "texture" }),
    F({ key: "packaging", label: "Csomagolás", editType: "TEXT" }),
    F({ key: "storageMode", label: "Tárolási mód", editType: "DROPDOWN", categoryId: "storageMode" }),
    F({ key: "storage", label: "Tárolási információ", editType: "LONGTEXT" }),
    F({ key: "manufacturer", label: "Gyártó", editType: "TEXT" }),
    F({ key: "distributor", label: "Forgalmazó", editType: "TEXT" }),
    F({ key: "allergenList", label: "Allergének", editType: "MULTISELECT", categoryId: "allergens" }),
    F({ key: "bestBeforeWording", label: "Minőségmegőrzési megfogalmazás", editType: "DROPDOWN", categoryId: "bestBefore", kind: "regulatory", permission: "admin" }),
    F({ key: "legalText", label: "Jogszabályi szöveg", editType: "LONGTEXT", kind: "regulatory", permission: "admin" }),
    F({ key: "legalRef", label: "Jogszabály azonosító", editType: "READ_ONLY", kind: "regulatory" }),
    F({ key: "ingredientText", label: "Összetevők", editType: "LONGTEXT" }),
    F({ key: "processDescription", label: "processDescription", editType: "LONGTEXT" }),
    F({ key: "physical", label: "physical", editType: "LONGTEXT" }),
    F({ key: "chemical", label: "chemical", editType: "LONGTEXT" }),
    F({ key: "micro", label: "micro", editType: "LONGTEXT" }),
    F({ key: "sensory", label: "sensory", editType: "LONGTEXT" }),
    F({ key: "foodSafety", label: "foodSafety", editType: "LONGTEXT" }),
    F({ key: "labelling", label: "labelling", editType: "LONGTEXT" }),
    F({ key: "claims", label: "claims", editType: "LONGTEXT" }),
    F({ key: "gmoStatement", label: "gmoStatement", editType: "LONGTEXT" }),
    F({ key: "consumerGroup", label: "consumerGroup", editType: "LONGTEXT" }),
    F({ key: "legalName", label: "legalName", editType: "LONGTEXT" }),
    F({ key: "sapCode", label: "sapCode", editType: "TEXT" }),
    F({ key: "taricCode", label: "taricCode", editType: "TEXT" }),
    F({ key: "variant", label: "variant", editType: "TEXT" }),
    F({ key: "plantName", label: "plantName", editType: "TEXT" }),
    F({ key: "plantAddress", label: "plantAddress", editType: "TEXT" }),
    F({ key: "healthMark", label: "healthMark", editType: "TEXT" }),
    F({ key: "recommendedUse", label: "recommendedUse", editType: "TEXT" }),
    F({ key: "packagingForm", label: "packagingForm", editType: "TEXT" }),
    F({ key: "packagingMaterial", label: "packagingMaterial", editType: "TEXT" }),
    F({ key: "secondaryPackaging", label: "secondaryPackaging", editType: "TEXT" }),
    F({ key: "palletPackaging", label: "palletPackaging", editType: "TEXT" }),
    F({ key: "weightTolerance", label: "weightTolerance", editType: "TEXT" }),
    F({ key: "shelfLife", label: "shelfLife", editType: "TEXT" }),
    F({ key: "transport", label: "transport", editType: "TEXT" }),
    F({ key: "distributionConditions", label: "distributionConditions", editType: "TEXT" }),
    F({ key: "mayContain", label: "mayContain", editType: "TEXT" }),
    F({ key: "servingsPerPack", label: "servingsPerPack", editType: "TEXT" }),
    F({ key: "infoLine", label: "infoLine", editType: "TEXT" }),
    F({ key: "website", label: "website", editType: "TEXT" }),
    F({ key: "barcode", label: "barcode", editType: "TEXT" }),
    F({ key: "preparedBy", label: "preparedBy", editType: "TEXT" }),
    F({ key: "responsible", label: "responsible", editType: "TEXT" }),
    F({ key: "approver", label: "approver", editType: "TEXT" }),
    F({ key: "effectiveDate", label: "effectiveDate", editType: "DATE" }),
  ].map((f) => [f.key, f]),
);

const NUTRIENT_UNITS: Record<string, string> = { energyKj: "kJ", energyKcal: "kcal" };

export function fieldDef(key: string, label?: string): FieldDef {
  if (FIELDS[key]) return FIELDS[key];
  if (key.startsWith("n100.")) {
    const n = key.slice(5);
    return { key, label: label ?? n, editType: "NUMBER", unit: NUTRIENT_UNITS[n] ?? "g" };
  }
  return { key, label: label ?? key, editType: "READ_ONLY" };
}

export function canEdit(f: FieldDef, admin: boolean) {
  if (f.editType === "READ_ONLY") return false;
  return f.permission === "admin" ? admin : true;
}
