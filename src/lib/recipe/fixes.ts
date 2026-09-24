import type { Check } from "./types";

export const STEPS = [
  "Források",
  "Alapanyagok",
  "Adatok",
  "Ellenőrzés",
  "Dokumentumok",
  "Jóváhagyás",
] as const;
export type Step = (typeof STEPS)[number];

export interface FixTarget {
  step: Step;
  /** data-anchor of the section/field to scroll to */
  anchor?: string;
  /** field key to open in inline edit mode */
  field?: string;
  label: string;
}

/** Deterministic mapping: every non-ok check → where it is fixed. */
export function fixTarget(c: Check): FixTarget {
  if (c.id === "doc-diff")
    return { step: "Dokumentumok", anchor: "doc-diffs", label: "ELTÉRÉSEK MEGNYITÁSA" };
  if (c.id === "ai-review")
    return { step: "Források", anchor: "AI adatellenőrzés", label: "ELLENŐRZÉS" };
  switch (c.action) {
    case "resolve-ingredients":
      return { step: "Alapanyagok", anchor: "ingredients", label: "ALAPANYAGOK JAVÍTÁSA" };
    case "set-value":
      return { step: "Adatok", anchor: `field:${c.field}`, field: c.field, label: "JAVÍTÁS" };
    case "regulatory":
      return { step: "Adatok", anchor: `field:${c.field}`, label: "ELLENŐRZÉS" };
    case "sources":
      if (c.id === "src-link")
        return { step: "Források", anchor: "Alapanyagok összekapcsolása", label: "ÖSSZEKAPCSOLÁS" };
      if (c.id === "src-conf")
        return { step: "Források", anchor: "Eltérő adatok", label: "ELTÉRÉSEK MEGNYITÁSA" };
      if (c.id === "src-qsus")
        return { step: "Források", anchor: "Minőségi paraméterek", label: "ELLENŐRZÉS" };
      if (c.id === "src-unk")
        return { step: "Források", anchor: "Új / nem besorolt adat", label: "JAVÍTÁS" };
      if (c.id === "src-reg" || c.id === "src-reg-bad")
        return { step: "Források", anchor: "Jogszabályi ellenőrzés", label: "ELLENŐRZÉS" };
      return { step: "Források", anchor: "Dokumentumok", label: "JAVÍTÁS" };
  }
  if (c.id === "txt")
    return {
      step: "Adatok",
      anchor: "field:ingredientText",
      field: "ingredientText",
      label: "ELLENŐRZÉS",
    };
  if (c.id === "qty" || c.id === "energy" || c.id === "recipe")
    return { step: "Alapanyagok", anchor: "ingredients", label: "JAVÍTÁS" };
  return { step: "Ellenőrzés", label: "JAVÍTÁS" };
}

export function openIssues(checks: Check[]) {
  return checks.filter((c) => c.level !== "ok");
}

/** Counter per step: number of open issues that are fixed on that step. */
export function stepCounters(checks: Check[]): Record<Step, { errors: number; warns: number }> {
  const out = Object.fromEntries(STEPS.map((s) => [s, { errors: 0, warns: 0 }])) as Record<
    Step,
    { errors: number; warns: number }
  >;
  for (const c of openIssues(checks)) {
    const t = fixTarget(c).step;
    if (c.level === "error") out[t].errors++;
    else out[t].warns++;
  }
  return out;
}

/** Blocking (error) issues that belong to a step. */
export function blockingFor(step: Step, checks: Check[]) {
  return checks.filter((c) => c.level === "error" && fixTarget(c).step === step);
}
