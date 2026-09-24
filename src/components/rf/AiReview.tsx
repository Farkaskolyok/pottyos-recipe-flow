import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { LevelIcon, Panel } from "@/components/rf/ui";
import { useStore } from "@/lib/store";
import { aiAnalyze } from "@/lib/ai.functions";
import {
  AI_CRITICAL,
  AI_TARGET_FIELDS,
  aiSummary,
  applyConfident,
  classify,
  collectSnippets,
  completeness,
  decideAi,
  recordMapping,
  storeAiResults,
  type AiValue,
} from "@/lib/recipe/ai";
import type { Dataset, Destination } from "@/lib/recipe/engine";
import type { Product } from "@/lib/recipe/types";
import { cn } from "@/lib/utils";

const pct = (c: number) => `${Math.round(c * 100)}%`;

export function AiReview({
  p,
  ds,
  onChange,
}: {
  p: Product;
  ds: Dataset;
  onChange: (next: Product, note: string) => void;
}) {
  const store = useStore();
  const user = store.settings.userName;
  const run = useServerFn(aiAnalyze);
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const [notFound, setNotFound] = useState<number | null>(null);
  const enabled = store.rawSettings.aiEnabled === true;
  const missing = Object.keys(AI_TARGET_FIELDS).filter((k) => !ds.basics[k]?.display.trim());
  const sum = aiSummary(p, missing);
  const vals = Object.values(p.aiValues ?? {});
  const open = vals.filter((v) => ["pending", "review", "suggestion"].includes(v.status));
  const level = vals.some((v) => v.status === "review") ? "warn" : "ok";

  const learn = (v: AiValue, accepted: boolean) =>
    store.setSettings({
      ...store.rawSettings,
      aiMappings: recordMapping(store.rawSettings.aiMappings ?? [], v, accepted, p.id),
    });

  async function analyse() {
    if (!navigator.onLine) return toast.error("Nincs internetkapcsolat.");
    const snippets = collectSnippets(p);
    if (!snippets.length) return toast.info("Nincs elemezhető szövegrészlet.");
    setBusy(true);
    try {
      const r = await run({
        data: {
          fields: missing.map((k) => ({ key: k, label: AI_TARGET_FIELDS[k] })),
          snippets: snippets.map((s) => ({ id: s.id, text: s.text })),
        },
      });
      if (!r.ok) return void toast.error(r.error);
      const { product, notFound } = storeAiResults(p, r.results, r.noise, snippets, missing);
      setNotFound(notFound.length);
      onChange(product, `AI adatellenőrzés lefutott (${snippets.length} szövegrészlet)`);
    } catch {
      toast.error("Az AI adatellenőrzés nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  const decide = (v: AiValue, accept: boolean) => {
    learn(v, accept);
    onChange(
      decideAi(p, v.fieldKey, accept, user),
      `AI érték ${accept ? "elfogadva" : "elvetve"}: ${AI_TARGET_FIELDS[v.fieldKey]}`,
    );
  };

  return (
    <div data-anchor="AI adatellenőrzés" className="mb-4 rounded-2xl">
      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold uppercase tracking-wide">AI adatellenőrzés</h2>
          <LevelIcon level={level} className="size-6" />
        </div>
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            Kikapcsolva. Adminisztrátor kapcsolhatja be: Beállítások → AI adatellenőrzés.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="rounded-full" onClick={analyse} disabled={busy}>
                {busy ? "ELEMZÉS…" : "AI ADATELLENŐRZÉS"}
              </Button>
              {sum.auto + sum.review > 0 && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    const pend = vals.filter((v) => v.status === "pending");
                    pend
                      .filter((v) => classify(v.fieldKey, v.confidence) === "auto")
                      .forEach((v) => learn(v, true));
                    onChange(applyConfident(p, user), "AI biztos találatok alkalmazva");
                  }}
                >
                  BIZTOS TALÁLATOK ALKALMAZÁSA
                </Button>
              )}
              {open.length > 0 && (
                <Button
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setShowList((x) => !x)}
                >
                  JAVASLATOK ÁTNÉZÉSE ({open.length})
                </Button>
              )}
            </div>
            {(sum.auto + sum.review > 0 || notFound != null) && (
              <ul className="mt-3 space-y-0.5 text-sm">
                <li>{sum.auto} mező kitölthető</li>
                <li>{sum.review} mező ellenőrzést igényel</li>
                <li>{notFound ?? sum.none} mezőhöz nincs adat</li>
              </ul>
            )}
            {showList && (
              <ul className="mt-4 divide-y text-sm">
                {open.map((v) => (
                  <li key={v.fieldKey} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{AI_TARGET_FIELDS[v.fieldKey]}</span>
                      <span
                        className={cn(
                          "text-xs",
                          v.confidence < 0.7 ? "text-muted-foreground" : "text-warning",
                        )}
                      >
                        {v.status === "suggestion" || v.confidence < 0.7
                          ? "Javaslat"
                          : "Ellenőrizendő"}{" "}
                        · {pct(v.confidence)}
                        {AI_CRITICAL.has(v.fieldKey) ? " · megerősítés szükséges" : ""}
                      </span>
                    </div>
                    <p className="mt-1">{v.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      „{v.originalSourceText}” — {v.sourceFile}
                      {v.page ? `, ${v.page}. oldal` : ""}
                      {v.sheet ? `, ${v.sheet}` : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" className="rounded-full" onClick={() => decide(v, true)}>
                        ELFOGADOM
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => decide(v, false)}
                      >
                        ELVETEM
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

const DOC_SHORT: Record<Destination, string> = {
  sheet: "Gyártmánylap",
  spec: "Specifikáció",
  pack: "Szövegterv",
};

export function Completeness({ ds, onOpen }: { ds: Dataset; onOpen: (key: string) => void }) {
  const c = completeness(ds);
  const [all, setAll] = useState(false);
  const shown = c.items.filter((i) => all || i.state !== "filled");
  return (
    <div data-anchor="Kimeneti dokumentumok teljessége" className="mb-4">
      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold uppercase tracking-wide">Kimeneti dokumentumok teljessége</h2>
          <span className="text-2xl font-bold">{c.pct}%</span>
        </div>
        <p className="text-sm">
          {c.filled} kitöltve · {c.review} ellenőrizendő · {c.missing} hiányzik
        </p>
        <ul className="mt-3 divide-y text-sm">
          {shown.map((i) => (
            <li key={i.key} className="flex items-center gap-3 py-2">
              <LevelIcon
                level={i.state === "filled" ? "ok" : i.state === "review" ? "warn" : "error"}
                className="size-4"
              />
              <span className="flex-1">{i.label}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {i.docs.map((d) => DOC_SHORT[d]).join(", ")}
              </span>
              {i.state !== "filled" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => onOpen(i.key)}
                >
                  {i.state === "missing" ? "KITÖLTÉS" : "ELLENŐRZÉS"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <button
          className="mt-2 text-xs text-muted-foreground underline"
          onClick={() => setAll((x) => !x)}
        >
          {all ? "Csak a hiányzók" : "Összes mező"}
        </button>
      </Panel>
    </div>
  );
}
