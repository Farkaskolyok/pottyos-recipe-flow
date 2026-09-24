import type React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import JSZip from "jszip";
import {
  StoreProvider,
  useStore,
  visibleProducts,
  mergeSaved,
  resetDemoState,
  effectiveSettings,
  visibleDictionary,
  type State,
} from "@/lib/store";
import { idbPut, STORES } from "@/lib/idb";
import { buildDemoWorkbook, DEMO_RECIPES, newProduct, seedProducts } from "@/lib/recipe/demo";
import { parseWorkbook } from "@/lib/recipe/parse";
import { DEMO_DICTIONARY } from "@/lib/recipe/dictionary";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import { DEFAULT_RULES } from "@/lib/recipe/rules";
import { DEFAULT_CATEGORIES } from "@/lib/recipe/fields";
import { buildDocs } from "@/lib/recipe/documents";
import { fillMaster } from "@/lib/recipe/docxTemplate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";

const S = DEFAULT_SETTINGS;
function realProduct(name = "Valós Túrókrém") {
  const p = newProduct(
    parseWorkbook(buildDemoWorkbook(DEMO_RECIPES[0]), "sajat_recept.xlsx", 1000),
    [],
    "Kovács",
  );
  p.overrides.productName = { value: name, by: "Kovács", at: "2026-01-01" };
  return p;
}
function state(demoMode: boolean, extra: State["products"] = []): State {
  return {
    products: [...seedProducts(DEMO_DICTIONARY, "x"), ...extra],
    dictionary: DEMO_DICTIONARY,
    settings: S,
    rules: DEFAULT_RULES,
    admin: true,
    categories: DEFAULT_CATEGORIES,
    demoMode,
  };
}

describe("demo / live test separation", () => {
  it("demo records are explicitly marked; real products are not", () => {
    expect(seedProducts(DEMO_DICTIONARY, "x").every((p) => p.isDemo === true)).toBe(true);
    expect(realProduct().isDemo).toBe(false);
  });
  it("demo mode ON shows demo product", () => {
    expect(visibleProducts(state(true)).some((p) => p.isDemo)).toBe(true);
  });
  it("demo mode OFF hides demo products, real products remain visible", () => {
    const r = realProduct();
    const v = visibleProducts(state(false, [r]));
    expect(v.map((p) => p.id)).toEqual([r.id]);
  });
  it("demo mode OFF does not seed new demo data on startup", () => {
    const r = realProduct();
    const merged = mergeSaved({ ...state(false), products: [r], dictionary: [] }, state(true));
    expect(merged.products.map((p) => p.id)).toEqual([r.id]);
    expect(merged.dictionary.some((d) => d.isDemo)).toBe(false);
  });
  it("demo reset affects only demo data", () => {
    const r = realProduct();
    const s = { ...state(true, [r]), settings: { ...S, userName: "Kovács" } };
    const next = resetDemoState(s);
    expect(next.products.find((p) => p.id === r.id)).toBe(r);
    expect(next.settings.userName).toBe("Kovács");
    expect(next.rules).toBe(s.rules);
  });
  it("live test hides fictional dictionary and placeholder defaults", () => {
    expect(visibleDictionary({ dictionary: DEMO_DICTIONARY, demoMode: false })).toEqual([]);
    expect(effectiveSettings(S, false).manufacturer).toBe("");
  });
});

describe("mode switching in the UI", () => {
  it("switching modes does not delete real data; rule switches work in both modes", async () => {
    const r = realProduct();
    await idbPut(STORES.state, "app", { ...state(true, [r]) });
    let api: ReturnType<typeof useStore> | null = null;
    function Probe() {
      const s = useStore();
      useEffect(() => {
        api = s;
      });
      return <span>{s.ready ? `n=${s.products.length}/${s.allProducts.length}` : "…"}</span>;
    }
    const { Route: Home } = await import("@/routes/index");
    const H = Home.options.component as () => React.ReactElement;
    render(
      <StoreProvider>
        <H />
        <Probe />
      </StoreProvider>,
    );
    await screen.findByText(/n=\d+/);
    const total = api!.allProducts.length;
    const u = userEvent.setup();
    await u.click(screen.getByRole("switch", { name: "Demó mód" }));
    expect(await screen.findByText("Átváltasz éles teszt módra?")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "ÁTVÁLTÁS" }));
    await waitFor(() => expect(api!.demoMode).toBe(false));
    expect(screen.getAllByText("ÉLES TESZT").length).toBeGreaterThan(0);
    expect(api!.products.map((p) => p.id)).toEqual([r.id]);
    expect(api!.allProducts.length).toBe(total);
    // rule switch in LIVE TEST
    const rule = api!.rules[0];
    api!.setRules(api!.rules.map((x) => (x.id === rule.id ? { ...x, active: !x.active } : x)));
    await waitFor(() => expect(api!.rules[0].active).toBe(!rule.active));
    // back to demo
    await u.click(screen.getByRole("switch", { name: "Demó mód" }));
    await u.click(await screen.findByRole("button", { name: "DEMÓ BEKAPCSOLÁSA" }));
    await waitFor(() => expect(api!.demoMode).toBe(true));
    expect(api!.products.some((p) => p.isDemo)).toBe(true);
    expect(api!.products.some((p) => p.id === r.id)).toBe(true);
    api!.setRules(api!.rules.map((x) => (x.id === rule.id ? { ...x, active: rule.active } : x)));
    await waitFor(() => expect(api!.rules[0].active).toBe(rule.active));
  });

  it("rules page has no demo-locked switches", async () => {
    const { Route } = await import("@/routes/szabalyok");
    const C = Route.options.component as () => React.ReactElement;
    render(
      <StoreProvider>
        <C />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("switch").length).toBeGreaterThan(0));
    for (const sw of screen.getAllByRole("switch")) expect(sw).not.toBeDisabled();
  });
});

describe("LIVE TEST export", () => {
  it("exported documents contain no demo values", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const f = String(url).split("/").pop()!;
      const b = readFileSync(resolve(__dirname, "../../public/templates", f));
      return new Response(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    });
    const p = realProduct();
    const settings = effectiveSettings(S, false);
    const dict = visibleDictionary({ dictionary: DEMO_DICTIONARY, demoMode: false });
    const ds = buildDataset(p, dict, settings);
    const docs = buildDocs(p, ds, dict, settings);
    for (const k of ["sheet", "spec", "pack"] as const) {
      const blob = await fillMaster(k, docs[k].fields, docs[k].rich);
      const zip = await JSZip.loadAsync(blob);
      const xml = (
        await Promise.all(
          Object.keys(zip.files)
            .filter((n) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(n))
            .map((n) => zip.file(n)!.async("string")),
        )
      ).join(" ");
      const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
      expect(text, k).not.toMatch(/demo|demó|fiktív|mintaváros/i);
    }
    vi.unstubAllGlobals();
  });
});
