import type React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import JSZip from "jszip";
import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import {
  fillMaster,
  loadMaster,
  ensureMasterTemplates,
  MASTER_FILES,
  MASTER_PLACEHOLDERS,
} from "@/lib/recipe/docxTemplate";
import type { Destination } from "@/lib/recipe/engine";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import { buildDocs } from "@/lib/recipe/documents";
import { DEMO_DICTIONARY } from "@/lib/recipe/dictionary";
import { demoPackageProduct } from "@/lib/recipe/demo";
import { loadFileBlob, saveFileBlob, listFileIds, purgeOrphanFiles } from "@/lib/idb";
import { StoreProvider, useStore, syncLocalFiles } from "@/lib/store";
import { createBackup, parseBackup, restoreBackup } from "@/lib/backup";
import denylist from "./fixtures/historical-denylist.json";

const KINDS: Destination[] = ["sheet", "spec", "pack"];
const PARTS = /^word\/(document|header\d+|footer\d+)\.xml$/;
const masterBytes = (k: Destination) =>
  readFileSync(resolve(__dirname, "../../public/templates", MASTER_FILES[k].file));

/** Local "network": serves /templates/* from disk; can be switched off to simulate offline. */
let online = true;
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    if (!online) throw new TypeError("Failed to fetch (offline)");
    const k = KINDS.find((x) => String(url).endsWith(MASTER_FILES[x].file));
    if (!k) return new Response("", { status: 404 });
    const b = masterBytes(k);
    return new Response(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  });
});

async function xmlParts(buf: ArrayBuffer | Uint8Array | Blob) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => PARTS.test(n));
  return Promise.all(names.map(async (n) => ({ n, xml: await zip.file(n)!.async("string") })));
}
const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
function parseOk(xml: string) {
  const d = new DOMParser().parseFromString(xml, "application/xml");
  return d.getElementsByTagName("parsererror").length === 0;
}

const dict = DEMO_DICTIONARY;
const S = DEFAULT_SETTINGS;
function demoDocs() {
  const p = demoPackageProduct(dict, "Teszt");
  const ds = buildDataset(p, dict, S);
  return buildDocs(p, ds, dict, S);
}

describe("master templates – structure and placeholders", () => {
  for (const k of KINDS) {
    it(`${MASTER_FILES[k].id}: valid DOCX, parseable XML, exact placeholder set`, async () => {
      const parts = await xmlParts(masterBytes(k));
      expect(parts.some((p) => p.n === "word/document.xml")).toBe(true);
      for (const p of parts) expect(parseOk(p.xml), p.n).toBe(true);
      const found = new Set(
        parts.flatMap((p) =>
          [...textOf(p.xml).matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((m) => m[1]),
        ),
      );
      const expected = new Set(MASTER_PLACEHOLDERS[k]);
      expect(
        [...expected].filter((x) => !found.has(x)),
        "missing",
      ).toEqual([]);
      expect(
        [...found].filter((x) => !expected.has(x)),
        "unknown",
      ).toEqual([]);
    });
  }
});

describe("historical value leak test (HARD FAILURE)", () => {
  const deny = new Set((denylist as { hashes: string[] }).hashes);
  const TOK = /[0-9A-Za-zÀ-ž][0-9A-Za-zÀ-ž.,/%-]*[0-9A-Za-zÀ-ž%]|[0-9]/g;
  const h = (t: string) => createHash("sha256").update(t.toLowerCase()).digest("hex").slice(0, 20);
  const EXPLICIT = [
    "106662",
    "2106909855",
    "5998200747953",
    "FrieslandCampina",
    "Mátészalka",
    "Túró Rudi",
    "Popomájer",
    "Kücsön",
    "Mészárosné",
    "Jármi",
    "pottyos.hu",
    "38g",
    "38 g",
    "27 nap",
  ];
  it("denylist is loaded", () => expect(deny.size).toBeGreaterThan(100));
  for (const k of KINDS) {
    it(`${MASTER_FILES[k].id}: no historical product value in document, headers, footers, tables`, async () => {
      const parts = await xmlParts(masterBytes(k));
      const leaks: string[] = [];
      for (const p of parts) {
        const text = textOf(p.xml).replace(/\{\{[^}]*\}\}/g, " ");
        for (const t of text.match(TOK) ?? []) if (deny.has(h(t))) leaks.push(`${p.n}: ${t}`);
        for (const e of EXPLICIT) if (text.includes(e)) leaks.push(`${p.n}: ${e}`);
        // barcodes, TARIC/SAP style ids and full dates must always be placeholders
        for (const m of text.match(/\b\d{8,14}\b|\b(19|20)\d\d\.\s?\d\d\.\s?\d\d\b/g) ?? [])
          leaks.push(`${p.n}: ${m}`);
      }
      expect(leaks).toEqual([]);
    });
  }
  it("detects a planted historical value", async () => {
    const zip = await JSZip.loadAsync(masterBytes("pack"));
    const xml = await zip.file("word/document.xml")!.async("string");
    const planted = xml.replace("{{barcode}}", "5998200747953");
    expect(textOf(planted)).toContain("5998200747953");
  });
});

describe("real master exports", () => {
  for (const k of KINDS) {
    it(`${MASTER_FILES[k].id}: filled from current data, no unresolved {{token}}`, async () => {
      const d = demoDocs()[k];
      const blob = await fillMaster(k, d.fields, d.rich);
      const parts = await xmlParts(blob);
      const all = parts.map((p) => textOf(p.xml)).join(" ");
      for (const p of parts) expect(parseOk(p.xml), p.n).toBe(true);
      expect(all).not.toMatch(/\{\{|\}\}/);
      const name = d.fields.productName || d.fields.marketingName;
      if (name) expect(all).toContain(name.replace(/&/g, "&amp;"));
    });
  }
  it("exported document-specific fields differ per document kind", () => {
    const docs = demoDocs();
    expect(docs.spec.fields.sapCode).toBeDefined();
    expect(docs.pack.fields.barcode).toBeDefined();
    expect(docs.sheet.fields.sapCode).toBeUndefined();
  });
});

describe("offline Word export", () => {
  it("works without network once templates are stored locally", async () => {
    online = true;
    const r = await ensureMasterTemplates();
    expect(Object.values(r).every(Boolean)).toBe(true);
    online = false;
    try {
      for (const k of KINDS) {
        const buf = await loadMaster(k);
        expect(buf.byteLength).toBeGreaterThan(1000);
        const d = demoDocs()[k];
        const blob = await fillMaster(k, d.fields, d.rich);
        expect(blob.size).toBeGreaterThan(1000);
      }
    } finally {
      online = true;
    }
  });
});

describe("orphaned file cleanup", () => {
  it("deleting a source file removes its stored blob", async () => {
    const { persistSourceFile, deleteSourceFile, getSourceBlob } =
      await import("@/lib/recipe/sources");
    await persistSourceFile("spec:x1", new File(["a"], "a.pdf"));
    expect(await loadFileBlob("spec:x1")).toBeTruthy();
    await deleteSourceFile("spec:x1");
    expect(await loadFileBlob("spec:x1")).toBeUndefined();
    expect(await getSourceBlob("spec:x1")).toBeNull();
  });

  it("deleting a product removes recipe, specification and reference blobs", async () => {
    let api: ReturnType<typeof useStore> | null = null;
    function Grab() {
      const s = useStore();
      useEffect(() => {
        api = s;
      });
      return <span>{s.ready ? `n=${s.products.length}` : "…"}</span>;
    }
    render(
      <StoreProvider>
        <Grab />
      </StoreProvider>,
    );
    await screen.findByText(/n=\d+/);
    await new Promise((r) => setTimeout(r, 800)); // let start-up file sync finish
    const p = api!.products.find((x) => x.files?.length)!;
    const ids = [`recipe:${p.id}`, ...p.files!.map((f) => f.id)];
    for (const id of ids) await saveFileBlob(id, new Blob(["x"]), id);
    api!.removeProduct(p.id);
    await waitFor(async () => {
      for (const id of ids) expect(await loadFileBlob(id)).toBeUndefined();
    });
  });

  it("orphan purge keeps referenced files only", async () => {
    await saveFileBlob("keep", new Blob(["k"]), "k");
    await saveFileBlob("orphan", new Blob(["o"]), "o");
    await purgeOrphanFiles(new Set(["keep"]));
    const ids = await listFileIds();
    expect(ids).toContain("keep");
    expect(ids).not.toContain("orphan");
  });
});

describe("recipe source reopening", () => {
  it("recipe file can be read back after a simulated reload", async () => {
    const p = demoPackageProduct(dict, "Teszt");
    await syncLocalFiles([p]); // stores the recipe original like a real upload
    vi.resetModules(); // "reload": fresh module state, no in-memory session files
    const fresh = await import("@/lib/recipe/sources");
    const got = await fresh.getSourceBlob(fresh.recipeFileId(p.id));
    expect(got?.name).toBe(p.raw.fileName);
    const zip = await JSZip.loadAsync(await got!.blob.arrayBuffer());
    expect(Object.keys(zip.files).some((n) => n.startsWith("xl/"))).toBe(true);
  });
});

describe("local backup", () => {
  it("backup → restore round-trips state and source files", async () => {
    await saveFileBlob("bk1", new Blob(["hello"], { type: "text/plain" }), "h.txt");
    const b = await createBackup({ products: [], dictionary: [] });
    const parsed = parseBackup(JSON.stringify(b));
    await saveFileBlob("bk1", new Blob(["changed"]), "h.txt");
    await restoreBackup(parsed);
    const f = await loadFileBlob("bk1");
    expect(await f!.blob.text()).toBe("hello");
    expect(() => parseBackup('{"x":1}')).toThrow();
  });
});

describe("persistent storage status", () => {
  async function renderSettings(persisted: boolean) {
    vi.stubGlobal("navigator", {
      ...navigator,
      storage: {
        estimate: async () => ({ usage: 5 * 1024 * 1024 }),
        persisted: async () => persisted,
        persist: async () => persisted,
      },
    });
    const { Route } = await import("@/routes/beallitasok");
    const C = Route.options.component as () => React.ReactElement;
    render(
      <StoreProvider>
        <C />
      </StoreProvider>,
    );
  }
  it("shows ✓ Garantált when granted", async () => {
    await renderSettings(true);
    expect(await screen.findByText("✓ Garantált")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows ! Nem garantált with a warning when not granted", async () => {
    await renderSettings(false);
    expect(await screen.findByText("! Nem garantált")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/törölheti/);
    vi.unstubAllGlobals();
  });
});
