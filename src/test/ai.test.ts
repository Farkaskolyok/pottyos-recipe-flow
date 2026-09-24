import { describe, expect, it } from "vitest";
import { demoPackageProduct } from "@/lib/recipe/demo";
import { DEMO_DICTIONARY } from "@/lib/recipe/dictionary";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import {
  applyConfident,
  classify,
  collectSnippets,
  completeness,
  decideAi,
  recordMapping,
  ruleCandidates,
  storeAiResults,
  supportedBySource,
} from "@/lib/recipe/ai";
import { fixTarget } from "@/lib/recipe/fixes";

const pkg = () => demoPackageProduct(DEMO_DICTIONARY, "T");
const snip = (p: ReturnType<typeof pkg>) => {
  const s = collectSnippets(p);
  s.push({
    id: "x1",
    text: "állomány: szájban olvad, sima állagú",
    fileId: "f",
    fileName: "a.pdf",
    page: 2,
  });
  s.push({ id: "x2", text: "TARIC: 1904 1010", fileId: "f", fileName: "a.pdf" });
  return s;
};

describe("AI fallback layer", () => {
  it("confidence routing and critical fields", () => {
    expect(classify("sensory", 0.95)).toBe("auto");
    expect(classify("sensory", 0.8)).toBe("review");
    expect(classify("sensory", 0.5)).toBe("suggestion");
    expect(classify("taricCode", 0.99)).toBe("review");
  });

  it("rejects values not supported by the source text", () => {
    expect(
      supportedBySource("szájban olvad, sima állagú", "állomány: szájban olvad, sima állagú"),
    ).toBe(true);
    expect(supportedBySource("ropogós", "állomány: szájban olvad")).toBe(false);
    const p = pkg();
    const s = snip(p);
    const { product } = storeAiResults(
      p,
      [{ fieldKey: "sensory", value: "ropogós, barna", snippetId: "x1", confidence: 0.99 }],
      [],
      s,
      ["sensory"],
    );
    expect(product.aiValues!.sensory.confidence).toBeLessThan(0.7);
  });

  it("stores traceable values, applies only confident ones, never overwrites manual", () => {
    const p = pkg();
    const s = snip(p);
    const { product, notFound } = storeAiResults(
      p,
      [
        {
          fieldKey: "sensory",
          value: "szájban olvad, sima állagú",
          snippetId: "x1",
          confidence: 0.95,
        },
        { fieldKey: "taricCode", value: "1904 1010", snippetId: "x2", confidence: 0.95 },
        { fieldKey: "barcode", value: "NOT_FOUND", snippetId: null, confidence: 0 },
      ],
      [],
      s,
      ["sensory", "taricCode", "barcode"],
    );
    expect(notFound).toEqual(["barcode"]);
    const v = product.aiValues!.sensory;
    expect(v).toMatchObject({
      sourceFile: "a.pdf",
      page: 2,
      originalSourceText: s[s.length - 2].text,
    });
    // nothing filled before applying
    expect(buildDataset(product, DEMO_DICTIONARY, DEFAULT_SETTINGS).basics.sensory.display).toBe(
      "",
    );
    const applied = applyConfident(product, "T");
    const ds = buildDataset(applied, DEMO_DICTIONARY, DEFAULT_SETTINGS);
    expect(ds.basics.sensory.origin).toBe("ai");
    expect(ds.basics.taricCode.ai?.status).toBe("review");
    const chk = ds.checks.find((c) => c.id === "ai-review")!;
    expect(chk.level).toBe("warn");
    expect(fixTarget(chk).step).toBe("Források");
    applied.overrides.sensory = { value: "Kézi", previous: "", by: "T", at: "" };
    expect(buildDataset(applied, DEMO_DICTIONARY, DEFAULT_SETTINGS).basics.sensory.display).toBe(
      "Kézi",
    );
    const rej = decideAi(applied, "taricCode", false, "T");
    expect(buildDataset(rej, DEMO_DICTIONARY, DEFAULT_SETTINGS).basics.taricCode.display).toBe("");
  });

  it("completeness counts filled / review / missing", () => {
    const c = completeness(buildDataset(pkg(), DEMO_DICTIONARY, DEFAULT_SETTINGS));
    expect(c.filled + c.review + c.missing).toBe(c.items.length);
    expect(c.missing).toBeGreaterThan(0);
  });

  it("mapping history marks rule candidates after 3 products", () => {
    const v = {
      fieldKey: "sensory",
      value: "x",
      sourceFile: "a",
      originalSourceText: "állomány: sima",
      confidence: 0.9,
      timestamp: "",
      status: "accepted" as const,
    };
    let h = recordMapping([], v, true, "p1");
    h = recordMapping(h, v, true, "p2");
    expect(ruleCandidates(h)).toHaveLength(0);
    h = recordMapping(h, v, true, "p3");
    expect(ruleCandidates(h)[0]).toMatchObject({ pattern: "allomany", fieldKey: "sensory" });
  });
});
