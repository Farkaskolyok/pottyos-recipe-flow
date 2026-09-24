import { describe, expect, it } from "vitest";
import { extractFromBlocks, isNoiseText, parseQualityValue } from "@/lib/recipe/sources";
import { blockingFor } from "@/lib/recipe/fixes";
import type { Check } from "@/lib/recipe/types";

const run = (...t: string[]) => extractFromBlocks(t.map((text, i) => ({ text, page: i + 1 })));

describe("source extraction false positives", () => {
  it("page number is not an unknown task", () => {
    expect(run("Oldalszám / Page: 1 / 6").unknown).toHaveLength(0);
    expect(isNoiseText("Page: 2 of 6")).toBe(true);
  });
  it("version number is not an unknown task", () => {
    expect(run("Version: 0 0").unknown).toHaveLength(0);
    expect(run("Revision: 3").unknown).toHaveLength(0);
  });
  it("EU definition paragraph is not an unknown task", () => {
    const r = run(
      "EU sugars definition: all monosaccharides and disaccharides",
      "EU dietary fibre definition: carbohydrate polymers with three or more units",
      "US dietary fibre belongs to carbohydrates: yes",
    );
    expect(r.unknown).toHaveLength(0);
  });
  it("a real unknown value still becomes a task", () => {
    expect(run("Szitaméret: 2 mm").unknown).toHaveLength(1);
  });
  it("ISO reference is not extracted as a measurement", () => {
    const f = run("Yeast and mould: MSZ EN ISO 21527-1:1999").fields;
    expect(f.find((x) => x.key === "q.yeast")).toBeUndefined();
  });
  it("pH extraction ignores standard numbers", () => {
    expect(parseQualityValue("q.ph", "ISO 1842:1991 4,2")?.value).toBe("4,2");
    const f = run("pH: 4.3 (MSZ EN 1132:1999)").fields.find((x) => x.key === "q.ph")!;
    expect(f.num).toBe(4.3);
    expect(f.method).toContain("1132");
    expect(parseQualityValue("q.ph", "ISO 1")).toBeNull();
  });
  it("pH out of 0–14 is marked suspicious", () => {
    expect(parseQualityValue("q.ph", "= 20")?.suspect).toBeTruthy();
  });
  it("microbiological result keeps ISO reference as method", () => {
    const f = run("Salmonella /25 g 0 MSZ EN ISO 6579:2006").fields.find(
      (x) => x.key === "q.salmonella",
    )!;
    expect(f.value).toBe("0");
    expect(f.method).toBe("MSZ EN ISO 6579:2006");
    const y = run("Yeast and mould: <100 CFU/g MSZ ISO 21527-1:2013").fields.find(
      (x) => x.key === "q.yeast",
    )!;
    expect(y.value).toBe("<100");
    expect(y.method).toContain("21527");
  });
  it("duplicate values are merged", () => {
    const f = run("pH: 4,2", "pH: 4,2").fields.filter((x) => x.key === "q.ph");
    expect(f).toHaveLength(1);
    expect(f[0]!.suspect).toBeUndefined();
    expect(run("Allergens: milk", "Allergens: milk").fields.filter((x) => x.key === "allergens")).toHaveLength(1);
  });
  it("conflicting values remain visible", () => {
    const f = run("pH: 4,2", "pH: 4,8").fields.filter((x) => x.key === "q.ph");
    expect(f).toHaveLength(1);
    expect(f[0]!.suspect).toMatch(/4,2.*4,8/);
  });
  it("warnings do not count as blocking errors", () => {
    const checks: Check[] = [
      { id: "src-unk", level: "warn", text: "x", action: "sources" },
      { id: "src-reg", level: "warn", text: "y", action: "sources" },
      { id: "src-qsus", level: "warn", text: "z", action: "sources" },
    ];
    expect(blockingFor("Források", checks)).toHaveLength(0);
  });
});
