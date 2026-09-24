import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "@/lib/recipe/parse";
import { buildDemoWorkbook, DEMO_RECIPES, demoPackageProduct, newProduct } from "@/lib/recipe/demo";
import { DEMO_DICTIONARY, matchIngredient } from "@/lib/recipe/dictionary";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import { roundNutrient } from "@/lib/recipe/rules";
import { applyLinkSuggestions, findConflicts, demoSpecFiles } from "@/lib/recipe/sources";
import { buildDocs, crossCheck } from "@/lib/recipe/documents";
import { blockingFor, fixTarget, stepCounters } from "@/lib/recipe/fixes";

const dict = DEMO_DICTIONARY;
const S = DEFAULT_SETTINGS;
const product = (i = 0) => newProduct(parseWorkbook(buildDemoWorkbook(DEMO_RECIPES[i]), "t.xlsx", 1000), dict, "Teszt");

describe("XLS/XLSX parsing", () => {
  it("reads ingredients from a real xlsx round-trip", () => {
    const buf = XLSX.write(buildDemoWorkbook(DEMO_RECIPES[0]), { type: "array", bookType: "xlsx" });
    const raw = parseWorkbook(XLSX.read(buf, { type: "array" }), "a.xlsx", 1);
    expect(raw.ingredients.length).toBe(DEMO_RECIPES[0].rows.length);
    expect(raw.ingredients[0].name).toBe("TURO_40");
  });
  it("reads legacy xls (biff8) too", () => {
    const buf = XLSX.write(buildDemoWorkbook(DEMO_RECIPES[0]), { type: "array", bookType: "biff8" });
    const raw = parseWorkbook(XLSX.read(buf, { type: "array" }), "a.xls", 1);
    expect(raw.ingredients.length).toBe(DEMO_RECIPES[0].rows.length);
  });
});

describe("rounding", () => {
  it("applies nutrient rounding rules", () => {
    expect(roundNutrient("energyKj", 1523.6).display).toBe("1524 kJ");
    expect(roundNutrient("fat", 12.6).display).toBe("13 g");
    expect(roundNutrient("fat", 3.44).display).toBe("3,4 g");
    expect(roundNutrient("fat", 0.3).display).toBe("<0,5 g");
    expect(roundNutrient("saturates", 0.05).display).toBe("<0,1 g");
    expect(roundNutrient("salt", 0.005).display).toBe("<0,01 g");
  });
});

describe("per-serving calculation", () => {
  it("scales per-100 g values by product weight", () => {
    const ds = buildDataset(product(), dict, S);
    const e = ds.nutrition.find((n) => n.key === "energyKj")!;
    expect(e.perServing).not.toBeNull();
    const per100 = Number(e.per100.calculated);
    const perS = Number(e.perServing!.calculated);
    expect(perS).toBeCloseTo((per100 * ds.weightG!) / 100, 3);
  });
});

describe("ingredient dictionary matching", () => {
  it("exact, fuzzy and unknown", () => {
    expect(matchIngredient("Kristálycukor", undefined, dict).status).toBe("recognized");
    expect(matchIngredient("Teljesen ismeretlen XYZ", undefined, dict)).toEqual({ status: "unknown", entryId: null });
  });
  it("unknown ingredient blocks with an error and a fix target", () => {
    const p = product();
    p.ingredients[0] = { ...p.ingredients[0], status: "unknown", entryId: null };
    const ds = buildDataset(p, dict, S);
    const c = ds.checks.find((x) => x.id === "unk")!;
    expect(c.level).toBe("error");
    expect(fixTarget(c)).toMatchObject({ step: "Alapanyagok", label: "ALAPANYAGOK JAVÍTÁSA" });
  });
});

describe("product package", () => {
  const pkg = () => demoPackageProduct(dict, "Teszt");
  it("links specifications to ingredients", () => {
    const p = pkg();
    expect(p.files!.some((f) => f.linkState === "linked")).toBe(true);
    expect(p.files!.some((f) => f.linkState === "suggested")).toBe(true);
    const relinked = applyLinkSuggestions(demoSpecFiles(), p.ingredients.map((i) => ({ row: i.raw.row, name: i.raw.name })));
    expect(relinked.filter((f) => f.linkState === "linked").length).toBeGreaterThan(0);
  });
  it("detects value conflicts and blocks until decided", () => {
    const p = pkg();
    const conf = findConflicts(p);
    expect(conf.length).toBeGreaterThan(0);
    const ds = buildDataset(p, dict, S);
    expect(ds.checks.find((c) => c.id === "src-conf")?.level).toBe("error");
    const c = conf[0];
    p.conflictDecisions = { [c.id]: { choice: "spec", value: c.spec, by: "T", at: "" } };
    expect(buildDataset(p, dict, S).checks.find((c) => c.id === "src-conf")).toBeUndefined();
  });
  it("regulatory review status blocks approval until checked", () => {
    const p = pkg();
    const ds = buildDataset(p, dict, S);
    const reg = ds.checks.find((c) => c.id === "src-reg")!;
    expect(reg.level).toBe("error");
    expect(fixTarget(reg)).toMatchObject({ step: "Források", label: "ELLENŐRZÉS" });
    p.files = p.files!.map((f) => ({ ...f, regulatory: f.regulatory.map((r) => ({ ...r, status: "ok" as const })) }));
    expect(buildDataset(p, dict, S).checks.find((c) => c.id === "src-reg")).toBeUndefined();
  });
});

describe("manual override / restore / company value", () => {
  it("override keeps the original, restore brings it back", () => {
    const p = product();
    const before = buildDataset(p, dict, S).basics.productName;
    p.overrides.productName = { value: "Kézi név", previous: before.display, by: "T", at: "" };
    const after = buildDataset(p, dict, S).basics.productName;
    expect(after.display).toBe("Kézi név");
    expect(after.origin).toBe("manual");
    expect(after.original).toEqual(before.original);
    delete p.overrides.productName;
    expect(buildDataset(p, dict, S).basics.productName.display).toBe(before.display);
  });
  it("company fixed value comes from settings", () => {
    const s = { ...S, companyDefaults: { ...S.companyDefaults, acceptanceRange: "5%" } };
    expect(buildDataset(product(), dict, s).basics.acceptanceRange.display).toContain("5");
  });
  it("regulatory field edit requires review", () => {
    const p = product();
    p.overrides.legalText = { value: "Új szöveg", previous: "", by: "T", at: "" };
    const c = buildDataset(p, dict, S).checks.find((x) => x.id === "reg-legalText")!;
    expect(c.level).toBe("error");
    p.regulatoryAck = { legalText: { by: "T", at: "" } };
    expect(buildDataset(p, dict, S).checks.find((x) => x.id === "reg-legalText")).toBeUndefined();
  });
});

describe("documents", () => {
  it("builds three document models from one data set and cross-checks them", () => {
    const p = product();
    const ds = buildDataset(p, dict, S);
    const docs = buildDocs(p, ds, dict, S);
    expect(Object.keys(docs).sort()).toEqual(["pack", "sheet", "spec"]);
    expect(docs.sheet.blocks.length).toBeGreaterThan(0);
    expect(crossCheck(docs)).toEqual([]);
    const bad = { ...docs, spec: { ...docs.spec, used: { ...docs.spec.used, [Object.keys(docs.sheet.used)[0]]: "ELTÉR" } } };
    expect(crossCheck(bad).length).toBe(1);
  });
});

describe("fix navigation mapping", () => {
  it("every open check has a target and step counters add up", () => {
    const p = demoPackageProduct(dict, "Teszt");
    const checks = buildDataset(p, dict, S).checks;
    const open = checks.filter((c) => c.level !== "ok");
    for (const c of open) expect(fixTarget(c).label).toBeTruthy();
    const counters = stepCounters(checks);
    const total = Object.values(counters).reduce((n, c) => n + c.errors + c.warns, 0);
    expect(total).toBe(open.length);
    expect(blockingFor("Források", checks).length).toBeGreaterThan(0);
  });
});
