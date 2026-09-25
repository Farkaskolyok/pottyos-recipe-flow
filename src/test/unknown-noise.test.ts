import { describe, it, expect } from "vitest";
import { extractFromBlocks } from "@/lib/recipe/sources";

const run = (lines: string[]) =>
  extractFromBlocks(lines.map((text) => ({ text, page: 1 })) as never);

describe("no false Új / nem besorolt adat", () => {
  it("contact, placeholders and legends never become unknown", () => {
    const r = run([
      "T/F: 06 24 887 398",
      "András Turos M: +46 70 5715025",
      "Csonka Attila M: +36 30-251-6024",
      "....................... expertise : pl: OÉTI, other",
      "Jelenlét/ Presence : + ; Mentesség /Freeness : - ;",
      "Diófélék / Sort of nuts: mandula, mogyoró, dió",
    ]);
    expect(r.unknown).toEqual([]);
  });

  it("sensory and process labels map to fields", () => {
    const r = run([
      "állomány: szájban olvad, sima állagú",
      "szín: fehér, törtfehér",
      "íz: joghurtos ízű, idegen íztől mentes",
      "szag: kellemes, joghurtra jellemző",
      "Bevonási hőmérséklet: 38–42 °C. A bevont termék hűtése ajánlott!",
    ]);
    expect(r.unknown).toEqual([]);
    const keys = r.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(["s.consistency", "s.colour", "s.taste", "s.smell", "process"]),
    );
  });
});
