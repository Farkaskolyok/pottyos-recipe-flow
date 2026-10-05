import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/recipe/types";
import {
  openSource,
  regStatus,
  REG_LABELS,
  type ExtractedField,
  type SourceFile,
} from "@/lib/recipe/sources";

export const SPEC_SECTIONS: [string, (k: string) => boolean][] = [
  [
    "Általános adatok",
    (k) => ["product_description", "general_description", "origin", "recommended_use"].includes(k),
  ],
  [
    "Beszállító",
    (k) => ["supplier", "manufacturer", "address", "telephone", "email", "contact"].includes(k),
  ],
  ["Összetétel", (k) => k === "composition"],
  ["Tápérték", (k) => k.startsWith("n.")],
  ["Tárolás", (k) => k === "storage_conditions" || k === "shelf_life"],
  ["Szállítás", (k) => k === "transport_conditions"],
  ["Csomagolás", (k) => k.includes("packaging")],
  ["Minőségi paraméterek", (k) => k.startsWith("q.") && !MICRO_KEYS.has(k)],
  ["Mikrobiológiai paraméterek", (k) => MICRO_KEYS.has(k)],
  ["Érzékszervi adatok", (k) => k.startsWith("s.")],
  ["Allergének", (k) => k === "allergens"],
  ["Élelmiszerbiztonság", (k) => k === "food_safety" || k === "gmo"],
];
const MICRO_KEYS = new Set([
  "q.tpc",
  "q.yeast",
  "q.salmonella",
  "q.ecoli",
  "q.saureus",
  "q.entero",
]);

export function fieldOutputs(f: ExtractedField): string[] {
  if (f.outputs) return f.outputs;
  if (f.key.startsWith("n.")) return ["sheet", "spec", "pack"];
  if (f.key.startsWith("q.") || f.key.startsWith("s.")) return ["sheet", "spec"];
  return ["internal"];
}

export function specStats(f: SourceFile) {
  const review = f.fields.filter((x) => x.suspect).length;
  const unclassified = f.unknown.filter((u) => !u.decision).length;
  const regOpen = f.regulatory.filter(
    (r) => regStatus(r) !== "verified_local" && regStatus(r) !== "verified_online",
  ).length;
  const out = { sheet: 0, spec: 0, pack: 0 };
  for (const x of f.fields)
    for (const o of fieldOutputs(x)) if (o in out) out[o as keyof typeof out]++;
  const outRelevantOpen = f.fields.filter(
    (x) => x.suspect && !fieldOutputs(x).includes("internal"),
  ).length;
  return { extracted: f.fields.length, review, unclassified, regOpen, out, outRelevantOpen };
}

export function specHeadline(f: SourceFile) {
  const s = specStats(f);
  const open = s.outRelevantOpen + s.unclassified + (f.status !== "ok" ? 1 : 0);
  return open
    ? `A specifikáció feldolgozva – ${s.review + s.unclassified} mező ellenőrzendő`
    : "Minden adat feldolgozva";
}

export function specFiles(p: Product) {
  return (p.files ?? []).filter(
    (f) =>
      f.sourceType === "SUPPLIER_SPECIFICATION" || f.sourceType === "RAW_MATERIAL_SPECIFICATION",
  );
}

export function SpecSummary({ p }: { p: Product }) {
  const files = specFiles(p);
  if (!files.length)
    return (
      <div className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground">Specifikációkból kinyert adatok</div>
        Nincs feltöltött alapanyag specifikáció.
      </div>
    );
  const all = files.flatMap((f) => f.fields);
  const cnt = (name: string) =>
    all.filter((x) => SPEC_SECTIONS.find((s) => s[0] === name)![1](x.key)).length;
  const st = files.map(specStats);
  const sum = (fn: (s: ReturnType<typeof specStats>) => number) =>
    st.reduce((n, s) => n + fn(s), 0);
  const rows: [string, number][] = [
    ["fájl feldolgozva", files.filter((f) => f.status !== "unreadable").length],
    ["mező kinyerve", all.length],
    ["minőségi paraméter", cnt("Minőségi paraméterek") + cnt("Mikrobiológiai paraméterek")],
    ["allergén adat", cnt("Allergének")],
    ["tárolási/szállítási adat", cnt("Tárolás") + cnt("Szállítás")],
    ["jogszabályi hivatkozás", files.reduce((n, f) => n + f.regulatory.length, 0)],
    ["ellenőrizendő mező", sum((s) => s.review + s.unclassified)],
  ];
  return (
    <div className="rounded-xl border px-4 py-3" data-anchor="spec-summary">
      <div className="mb-1 font-semibold">Specifikációkból kinyert adatok</div>
      <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
        {rows.map(([l, n]) => (
          <li
            key={l}
            className={cn(l.startsWith("ellenőrizendő") && n > 0 && "font-semibold text-warning")}
          >
            <b>{n}</b> {l}
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t pt-2 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Kimeneti dokumentumokhoz felhasználható adatok
        </div>
        Gyártmánylap: <b>{sum((s) => s.out.sheet)}</b> mező · Késztermék specifikáció:{" "}
        <b>{sum((s) => s.out.spec)}</b> mező · Szövegterv: <b>{sum((s) => s.out.pack)}</b> mező
      </div>
    </div>
  );
}

export function SpecDrawer({ file, onClose }: { file: SourceFile | null; onClose: () => void }) {
  const s = file ? specStats(file) : null;
  return (
    <Sheet open={!!file} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {file && s && (
          <>
            <SheetHeader>
              <SheetTitle>{file.name}</SheetTitle>
            </SheetHeader>
            <div className="mt-3 space-y-4 text-sm">
              <div className="rounded-lg bg-muted px-3 py-2">
                <div className="font-semibold">{specHeadline(file)}</div>
                Kinyert: {s.extracted} mező · Ellenőrizendő: {s.review} · Nem besorolt:{" "}
                {s.unclassified}
                <div className="mt-1 text-xs text-muted-foreground">
                  Gyártmánylap: {s.out.sheet} · Késztermék specifikáció: {s.out.spec} · Szövegterv:{" "}
                  {s.out.pack}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => openSource(file.id)}
              >
                Forrás megnyitása
              </Button>
              {SPEC_SECTIONS.map(([name, test]) => {
                const fs = file.fields.filter((x) => test(x.key));
                return (
                  <section key={name}>
                    <h3 className="mb-1 font-bold">{name}</h3>
                    {fs.length ? (
                      <ul className="divide-y rounded-lg border">
                        {fs.map((x, i) => (
                          <li key={i} className="flex gap-3 px-3 py-1.5">
                            <span className="w-40 shrink-0 text-muted-foreground">{x.label}</span>
                            <span className="min-w-0 flex-1 break-words">
                              {x.suspect && <b className="text-warning">! </b>}
                              {x.value}
                              {x.unit ? ` ${x.unit}` : ""}
                              {x.method && (
                                <span className="text-xs text-muted-foreground"> · {x.method}</span>
                              )}
                            </span>
                            {x.page && (
                              <span className="text-xs text-muted-foreground">{x.page}. o.</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">Nem talált</p>
                    )}
                  </section>
                );
              })}
              <section>
                <h3 className="mb-1 font-bold">Jogszabályok</h3>
                {file.regulatory.length ? (
                  <ul className="divide-y rounded-lg border">
                    {file.regulatory.map((r) => (
                      <li key={r.id} className="flex justify-between px-3 py-1.5">
                        <span>{r.identifier}</span>
                        <span className="text-xs text-muted-foreground">
                          {REG_LABELS[regStatus(r)]}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Nem talált</p>
                )}
              </section>
              {file.fields.some((x) => !SPEC_SECTIONS.some(([, t]) => t(x.key))) && (
                <section>
                  <h3 className="mb-1 font-bold">Egyéb kinyert adatok</h3>
                  <ul className="divide-y rounded-lg border">
                    {file.fields
                      .filter((x) => !SPEC_SECTIONS.some(([, t]) => t(x.key)))
                      .map((x, i) => (
                        <li key={i} className="flex gap-3 px-3 py-1.5">
                          <span className="w-40 shrink-0 text-muted-foreground">{x.label}</span>
                          <span className="flex-1 break-words">{x.value}</span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}
              {file.unknown.length > 0 && (
                <section>
                  <h3 className="mb-1 font-bold">Nem besorolt</h3>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {file.unknown.map((u) => (
                      <li key={u.id}>{u.text}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function useSpecDrawer() {
  return useState<SourceFile | null>(null);
}
