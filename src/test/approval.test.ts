import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseWorkbook } from "@/lib/recipe/parse";
import { buildDemoWorkbook, DEMO_RECIPES, newProduct } from "@/lib/recipe/demo";
import { DEMO_DICTIONARY } from "@/lib/recipe/dictionary";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import { roundNutrient } from "@/lib/recipe/rules";
import { buildDocs } from "@/lib/recipe/documents";
import { fillMaster } from "@/lib/recipe/docxTemplate";
import {
  approvalBlockers,
  approveProduct,
  canCheck,
  checkProduct,
  finalExportAllowed,
  NO_CHECKER,
  SAME_PERSON,
} from "@/lib/recipe/approval";

const dict = DEMO_DICTIONARY;
const S = DEFAULT_SETTINGS;
const mk = () =>
  newProduct(parseWorkbook(buildDemoWorkbook(DEMO_RECIPES[0]), "t.xlsx", 1), dict, "Gergely Kovács");

describe("per-product nutrition", () => {
  it("per product = per100 × weight / 100, rounded with existing rules", () => {
    const p = mk();
    p.overrides.productWeight = { value: "250 g", previous: "", by: "T", at: "" };
    const ds = buildDataset(p, dict, S);
    expect(ds.weightG).toBe(250);
    for (const n of ds.nutrition) {
      const c = (Number(n.per100.calculated) * 250) / 100;
      expect(Number(n.perServing!.calculated)).toBeCloseTo(c, 6);
      expect(n.perServing!.display).toBe(roundNutrient(n.key, c).display);
      expect(n.perServing!.origin).toBe("calculated");
    }
  });
  it("missing net weight: no per-product values, blocking error, message in Szövegterv", () => {
    const p = mk();
    p.overrides.productWeight = { value: "", previous: "", by: "T", at: "" };
    const ds = buildDataset(p, dict, S);
    expect(ds.weightG).toBeNull();
    expect(ds.nutrition.every((n) => n.perServing === null)).toBe(true);
    const c = ds.checks.find((x) => x.id === "nserv")!;
    expect(c.level).toBe("error");
    expect(c.text).toBe("1 darabra számított tápérték nem számítható – nettó tömeg hiányzik");
    const docs = buildDocs(p, ds, dict, S);
    expect(docs.pack.fields.psv_energy).toContain("nettó tömeg hiányzik");
  });
});

describe("four-eyes approval", () => {
  it("creator cannot check own work", () => {
    const p = mk();
    expect(canCheck(p, "Gergely Kovács")).toBe(false);
    expect(() => checkProduct(p, "gergely kovács ")).toThrow(SAME_PERSON);
  });
  it("another user can check; records checkedBy, checkedAt and audit", () => {
    const p = checkProduct(mk(), "Anna Example", "2026-09-25T09:15:00.000Z");
    expect(p.checkedBy).toBe("Anna Example");
    expect(p.checkedAt).toBe("2026-09-25T09:15:00.000Z");
    expect(p.audit!.at(-1)!.text).toBe("Dokumentumok ellenőrizve: Anna Example");
  });
  it("approval blocked without checker and when checker == creator", () => {
    const p = mk();
    expect(approvalBlockers(p, 0, "X")).toContain(NO_CHECKER);
    expect(approvalBlockers({ ...p, checkedBy: "Gergely Kovács" }, 0, "X")).toContain(SAME_PERSON);
    expect(approvalBlockers(checkProduct(p, "Anna"), 0, "Péter")).toEqual([]);
  });
  it("final export blocked before approval, enabled after valid review + approval", () => {
    const p = mk();
    expect(finalExportAllowed(p, 0)).toBe(false);
    const checked = checkProduct(p, "Anna Example");
    expect(finalExportAllowed(checked, 0)).toBe(false);
    const ok = approveProduct(checked, "Péter Example");
    expect(ok.audit!.at(-1)!.text).toBe("Termék jóváhagyva: Péter Example");
    expect(finalExportAllowed(ok, 0)).toBe(true);
    expect(finalExportAllowed(ok, 1)).toBe(false);
    expect(finalExportAllowed({ ...ok, checkedBy: ok.createdBy, reviewedBy: undefined }, 0)).toBe(
      false,
    );
  });
  it("creator / checker / approver appear in Word outputs; drafts are marked TERVEZET", async () => {
    const p = approveProduct(checkProduct(mk(), "Anna Example"), "Péter Example");
    const docs = buildDocs(p, buildDataset(p, dict, S), dict, S);
    const text = async (k: "sheet" | "spec" | "pack", draft = false) => {
      const z = await JSZip.loadAsync(
        await (
          await fillMaster(k, docs[k].fields, docs[k].rich, { draft })
        ).arrayBuffer(),
      );
      return (await z.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    };
    const sheet = await text("sheet");
    expect(sheet).toContain("Gergely Kovács");
    expect(sheet).toContain("Péter Example");
    const spec = await text("spec");
    expect(spec).toContain("Gergely Kovács");
    expect(spec).toContain("Anna Example");
    expect(sheet).not.toContain("TERVEZET");
    expect(await text("pack", true)).toContain("TERVEZET");
  });
});
