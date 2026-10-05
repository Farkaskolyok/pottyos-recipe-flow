import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { getSourceBlob, isSupportedSourceFile, processFile } from "@/lib/recipe/sources";
import { loadFileBlob } from "@/lib/idb";

afterEach(() => vi.unstubAllGlobals());

describe("supporting document imports", () => {
  it.each(["supplier.doc", "supplier.DOC"])(
    "rejects %s without reading, storing, or sending its contents",
    async (name) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const file = new File(["Allergens: milk"], name, { type: "application/msword" });
      const read = vi.spyOn(file, "arrayBuffer");

      expect(isSupportedSourceFile(name)).toBe(false);
      const source = await processFile(file, "spec");

      expect(source.status).toBe("unreadable");
      expect(source.warnings).toEqual([
        "Nem támogatott fájlformátum. Használjon PDF, DOCX, XLS vagy XLSX fájlt.",
      ]);
      expect(source.fields).toEqual([]);
      expect(read).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(await getSourceBlob(source.id)).toBeNull();
      expect(await loadFileBlob(source.id)).toBeUndefined();
    },
  );

  it.each(["spec", "reference"] as const)(
    "imports DOCX %s documents offline and keeps the original",
    async (section) => {
      const fetch = vi.fn(() => {
        throw new Error("Offline");
      });
      vi.stubGlobal("fetch", fetch);
      const zip = new JSZip();
      const lines = [
        "Allergens: milk",
        "Preservative: K-sorbat",
        "Colour: Carmine",
        "Flavour: raspberry",
        "Bearer: E1520",
      ];
      zip.file(
        "word/document.xml",
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines
          .map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`)
          .join("")}</w:body></w:document>`,
      );
      const bytes = await zip.generateAsync({ type: "uint8array" });
      const file = new File([bytes], "supplier.DOCX", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      expect(isSupportedSourceFile(file.name)).toBe(true);
      const source = await processFile(file, section);

      expect(source.status).toBe("ok");
      expect(source.warnings).toEqual([]);
      expect(source.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "allergens", value: "milk" }),
          expect.objectContaining({ key: "composition.preservative", value: "K-sorbat" }),
          expect.objectContaining({ key: "s.colour", value: "Carmine" }),
          expect.objectContaining({ key: "s.taste", value: "raspberry" }),
          expect.objectContaining({ key: "composition.carrier", value: "E1520" }),
        ]),
      );
      expect(source.unknown).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
      const stored = await loadFileBlob(source.id);
      expect(stored?.name).toBe(file.name);
      expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(bytes);
    },
  );
});
