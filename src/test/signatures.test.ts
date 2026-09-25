import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { parseWorkbook } from "@/lib/recipe/parse";
import { buildDemoWorkbook, DEMO_RECIPES, newProduct } from "@/lib/recipe/demo";
import { DEMO_DICTIONARY } from "@/lib/recipe/dictionary";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import { buildDocs } from "@/lib/recipe/documents";
import { fillMaster, MASTER_FILES } from "@/lib/recipe/docxTemplate";
import { approveProduct, checkProduct } from "@/lib/recipe/approval";
import {
  fitEmu,
  jpegSize,
  MAX_H,
  MAX_W,
  setOwnSignature,
  signatureFields,
  signatureSlots,
  ymd,
  type SigImage,
  type SlotKey,
  type UserProfile,
} from "@/lib/recipe/signatures";

const fx = (n: string) => readFileSync(resolve(__dirname, "fixtures", n));
const dataUrl = (n: string) => `data:image/jpeg;base64,${fx(n).toString("base64")}`;

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const f = Object.values(MASTER_FILES).find((x) => String(url).endsWith(x.file));
    if (!f) return new Response("", { status: 404 });
    const b = readFileSync(resolve(__dirname, "../../public/templates", f.file));
    return new Response(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  });
});

const dict = DEMO_DICTIONARY;
const users: UserProfile[] = [
  { name: "Gergely Kovács", role: "KÉSZÍTŐ", signatureImage: dataUrl("sig-peter.jpg") },
  { name: "Anna Example", role: "ELLENŐR", signatureImage: dataUrl("sig-anna.jpg") },
  { name: "Péter Example", role: "JÓVÁHAGYÓ" },
];
const base = () => {
  const p = newProduct(
    parseWorkbook(buildDemoWorkbook(DEMO_RECIPES[0]), "t.xlsx", 1),
    dict,
    "Gergely Kovács",
  );
  p.createdAt = "2026-09-20T10:00:00";
  return p;
};
const approved = () =>
  approveProduct(
    checkProduct(base(), "Anna Example", "2026-09-24T09:00:00"),
    "Péter Example",
    "2026-09-25T08:00:00",
  );

async function render(p: ReturnType<typeof base>, final: boolean, kind: "sheet" | "spec" = "spec") {
  const docs = buildDocs(p, buildDataset(p, dict, DEFAULT_SETTINGS), dict, DEFAULT_SETTINGS);
  const slots = signatureSlots(p, users, final);
  const imgs: Partial<Record<SlotKey, SigImage>> = {};
  for (const [k, v] of Object.entries(slots)) if (v?.image) imgs[k as SlotKey] = v.image;
  const blob = await fillMaster(
    kind,
    { ...docs[kind].fields, ...signatureFields(slots, final) },
    docs[kind].rich,
    { draft: !final, signatures: imgs },
  );
  const z = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await z.file("word/document.xml")!.async("string");
  const media = Object.keys(z.files).filter((f) => f.startsWith("word/media/signature_"));
  return { z, xml, text: xml.replace(/<[^>]+>/g, ""), media };
}

describe("signatures", () => {
  it("keeps aspect ratio within the max box", () => {
    const s = jpegSize(new Uint8Array(fx("sig-anna.jpg")))!;
    expect(s).toEqual({ w: 400, h: 100 });
    const f = fitEmu(s.w, s.h);
    expect(f.cx).toBeLessThanOrEqual(MAX_W);
    expect(f.cy).toBeLessThanOrEqual(MAX_H);
    expect(f.cx / f.cy).toBeCloseTo(4, 2);
    const sq = fitEmu(300, 300);
    expect(sq.cx).toBe(sq.cy);
  });
  it("uses the correct user's signature and only for completed actions", () => {
    const slots = signatureSlots(approved(), users, true);
    expect(slots.CHECKED!.image!.bytes).toEqual(new Uint8Array(fx("sig-anna.jpg")));
    expect(slots.CREATED!.image!.bytes).toEqual(new Uint8Array(fx("sig-peter.jpg")));
    expect(slots.APPROVED!.image).toBeUndefined(); // Péter has no stored signature
    expect(signatureSlots(base(), users, true).CHECKED).toBeUndefined();
  });
  it("creator / checker / approver dates are the action dates; final date is today", () => {
    const f = signatureFields(signatureSlots(approved(), users, true), true, new Date(2026, 8, 25));
    expect(f.CREATED_DATE).toBe("2026.09.20.");
    expect(f.CHECKED_DATE).toBe("2026.09.24.");
    expect(f.APPROVED_DATE).toBe("2026.09.25.");
    expect(f.date).toBe("2026.09.25.");
    expect(ymd(new Date(2026, 0, 5))).toBe("2026.01.05.");
  });
  it("one user cannot set another user's signature", () => {
    expect(() => setOwnSignature(users, "Anna Example", "Gergely Kovács", {})).toThrow();
    const next = setOwnSignature(users, "Anna Example", "Anna Example", { role: "JÓVÁHAGYÓ" });
    expect(next.find((u) => u.name === "Anna Example")!.role).toBe("JÓVÁHAGYÓ");
  });
  it("final export inserts the signature JPGs; draft has none", async () => {
    const fin = await render(approved(), true);
    expect(fin.media.length).toBe(2);
    expect(fin.xml).toContain("<w:drawing>");
    expect(fin.xml).not.toContain("{{");
    expect(fin.text).toContain(ymd(new Date()));
    expect(fin.text).toContain("2026.09.20.");
    const rels = await fin.z.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain("media/signature_checked.jpg");
    expect(await fin.z.file("[Content_Types].xml")!.async("string")).toContain('Extension="jpg"');
    const dr = await render(approved(), false);
    expect(dr.media.length).toBe(0);
    expect(dr.xml).not.toContain("<w:drawing>");
    expect(dr.text).toContain("TERVEZET");
  });
  it("Gyártmánylap gets creator and approver slots", async () => {
    const fin = await render(approved(), true, "sheet");
    expect(fin.media).toContain("word/media/signature_created.jpg");
    expect(fin.text).toContain("2026.09.25.");
  });
});
