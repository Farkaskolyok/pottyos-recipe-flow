// Core domain model. UI-independent; all processing is local (browser).

export type Origin = "source" | "calculated" | "manual";
export type MatchStatus = "recognized" | "review" | "unknown";
export type CheckLevel = "ok" | "warn" | "error";
export type ProductStatus = "draft" | "review" | "approved" | "archived";

export const NUTRIENTS = [
  "energyKj",
  "energyKcal",
  "fat",
  "saturates",
  "carbohydrate",
  "sugars",
  "fibre",
  "protein",
  "salt",
] as const;
export type NutrientKey = (typeof NUTRIENTS)[number];

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energyKj: "Energia (kJ)",
  energyKcal: "Energia (kcal)",
  fat: "Zsír",
  saturates: "ebből telített zsírsavak",
  carbohydrate: "Szénhidrát",
  sugars: "ebből cukrok",
  fibre: "Élelmi rost",
  protein: "Fehérje",
  salt: "Só",
};

/** Where a raw value came from in the source workbook. */
export interface SourceRef {
  file: string;
  sheet: string;
  cell: string;
}

/** Traceable value: original, calculated and displayed are kept separately. */
export interface TracedValue {
  label: string;
  original: string | number | null;
  calculated: number | string | null;
  display: string;
  unit?: string;
  origin: Origin;
  source?: SourceRef;
  rule?: string;
  manual?: { by: string; at: string; note?: string; previous: string };
}

export interface RawIngredientRow {
  row: number;
  name: string;
  code?: string;
  producer?: string;
  quantity: number | null;
  nutrients: Partial<Record<NutrientKey | "totalSolids", number>>;
  refs: Record<string, string>; // field -> cell address
}

export interface RawRecipe {
  fileName: string;
  fileSize: number;
  sheetNames: string[];
  sheet: string;
  templateId: string | null;
  meta: Record<string, { value: string | number; cell: string }>;
  ingredients: RawIngredientRow[];
  columnMap: Record<string, string>; // field -> column letter
}

export interface DictionaryEntry {
  id: string;
  technicalName: string;
  aliases: string[];
  canonicalName: string;
  packagingName: string;
  materialCode?: string;
  manufacturer?: string;
  allergen?: string;
  group?: string;
  parent?: string;
  subIngredients?: string;
  showPercentage: boolean;
  mandatoryText?: string;
  notes?: string;
  status: "approved" | "review";
}

export interface ResolvedIngredient {
  raw: RawIngredientRow;
  status: MatchStatus;
  entryId: string | null;
  deferred?: boolean;
  percentage: number;
}

export interface Check {
  id: string;
  level: CheckLevel;
  text: string;
  action?: "resolve-ingredients" | "set-value";
  field?: string;
}

export interface VersionEntry {
  version: string;
  date: string;
  note: string;
}

export interface Product {
  id: string;
  internalId: string;
  recipeVersion: string;
  docVersion: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  reviewedBy?: string;
  approvedBy?: string;
  raw: RawRecipe;
  ingredients: ResolvedIngredient[];
  /** manual overrides keyed by field id */
  overrides: Record<string, { value: string; by: string; at: string; note?: string; previous: string }>;
  ingredientTextOverride?: string;
  history: VersionEntry[];
}
