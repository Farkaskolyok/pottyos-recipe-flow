import { describe, it, expect } from "vitest";
import { extractFromBlocks, isReadableLegacyText } from "@/lib/recipe/sources";

const run = (lines: string[]) =>
  extractFromBlocks(lines.map((text) => ({ text })) as never, { legacy: true });

describe("legacy .doc fallback", () => {
  it("rejects binary garbage", () => {
    const bad = [
      "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "ÿÿÿÿÿÿ Summary Properties",
      "Root Entry Properties: CompObj",
      "urn:schemas-microsoft-com:office:office",
      "customXml datastoreItem: clrMap",
      "mailto:info@example.com: xmlns",
      "qZxkT: vbNmQwRtPl",
    ];
    for (const t of bad) expect(isReadableLegacyText(t)).toBe(false);
    expect(run(bad).unknown).toEqual([]);
  });
  it("isolated title is not a task", () => {
    expect(run(["Maclean KB Frutos"]).unknown).toEqual([]);
  });
  it("keeps and maps business lines", () => {
    const r = run([
      "Preservative: K-sorbat",
      "Colour: Carmine",
      "Flavour: raspberry",
      "Bearer: E1520",
    ]);
    expect(r.unknown).toEqual([]);
    expect(r.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining([
        "composition.preservative",
        "s.colour",
        "s.taste",
        "composition.carrier",
      ]),
    );
    const h = run(["Hordozó/Bearer: see ingredient list in TDS"]);
    expect(h.unknown).toEqual([]);
    expect(h.fields[0]?.key).toBe("composition.carrier");
  });
});
