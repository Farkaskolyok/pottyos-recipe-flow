import { AiReview, Completeness } from "@/components/rf/AiReview";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Pencil, RotateCcw, Check as CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { autoIngredientText, buildDataset } from "@/lib/recipe/engine";
import { buildDocs, crossCheck, DOC_TITLES } from "@/lib/recipe/documents";
import { exportAll, exportDocx } from "@/lib/recipe/docx";
import { signatureSlots, SLOT_ROLE, type SlotKey } from "@/lib/recipe/signatures";
import {
  approvalBlockers,
  approveProduct,
  audit as addAudit,
  canCheck,
  checkerOf,
  checkProduct,
  finalExportAllowed,
  SAME_PERSON,
  uncheckProduct,
} from "@/lib/recipe/approval";
import type { Product, ResolvedIngredient, TracedValue, DictionaryEntry } from "@/lib/recipe/types";
import { huDate, huNumber, uid } from "@/lib/recipe/format";
import { LevelIcon, MatchPill, OriginTag, Panel, StatusPill } from "@/components/rf/ui";
import { DocPreview } from "@/components/rf/DocPreview";
import { EditProvider, InlineField, type EditApi } from "@/components/rf/InlineField";
import { cn } from "@/lib/utils";
import { ProductActions } from "@/components/rf/ProductActions";
import { SourcesStep } from "@/components/rf/SourcesStep";
import { SpecDrawer, SpecSummary, specFiles, specStats } from "@/components/rf/SpecOverview";
import type { SourceFile } from "@/lib/recipe/sources";
import { openSource, recipeFileId } from "@/lib/recipe/sources";
import {
  blockingFor,
  fixTarget,
  openIssues,
  STEPS,
  stepCounters,
  type Step,
} from "@/lib/recipe/fixes";
import { IssueRow, StepCounter, StepFooter, ValidationStep } from "@/components/rf/Workflow";
import type { Check } from "@/lib/recipe/types";

export const Route = createFileRoute("/termekek/$id")({
  head: () => ({
    meta: [
      { title: "Termék feldolgozása – PÖTTYÖS RecipeFlow" },
      {
        name: "description",
        content: "Alapanyagok, tápérték, ellenőrzés, dokumentumok és jóváhagyás egy helyen.",
      },
      { property: "og:title", content: "Termék feldolgozása – PÖTTYÖS RecipeFlow" },
      {
        property: "og:description",
        content: "Alapanyagok, tápérték, ellenőrzés, dokumentumok és jóváhagyás.",
      },
    ],
  }),
  component: ProductPage,
});

function bump(p: Product, note: string): Product {
  const [maj, min] = p.docVersion.replace("v", "").split(".").map(Number);
  const v = `v${maj}.${(min || 0) + 1}`;
  return {
    ...p,
    docVersion: v,
    history: [...p.history, { version: v, date: new Date().toISOString(), note }],
  };
}

function ProductPage() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const store = useStore();
  const p = store.getProduct(id);
  const [step, setStep] = useState<Step>(() =>
    store.getProduct(id)?.files?.length ? "Források" : "Alapanyagok",
  );
  const [trace, setTrace] = useState<{ key: string; v: TracedValue } | null>(null);

  const ds = useMemo(
    () => (p ? buildDataset(p, store.dictionary, store.settings) : null),
    [p, store.dictionary, store.settings],
  );
  const docs = useMemo(
    () => (p && ds ? buildDocs(p, ds, store.dictionary, store.settings) : null),
    [p, ds, store.dictionary, store.settings],
  );
  const [focus, setFocus] = useState<{ anchor?: string; field?: string; n: number } | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const fixing = useRef<string | null>(null);
  const [blocked, setBlocked] = useState<Check[] | null>(null);

  // Smart navigation: after a JAVÍTÁS click, scroll to the target and highlight it briefly.
  useEffect(() => {
    if (!focus?.anchor) return;
    const t = window.setTimeout(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>("[data-anchor]")).find(
        (e) => e.dataset.anchor === focus.anchor,
      );
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("rf-flash");
      void el.offsetWidth;
      el.classList.add("rf-flash");
    }, 80);
    return () => window.clearTimeout(t);
  }, [focus, step]);

  if (!store.ready) return <p className="text-muted-foreground">Betöltés…</p>;
  if (!p || !ds || !docs)
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">A termék nem található.</p>
        <Button asChild className="mt-4 rounded-full">
          <Link to="/termekek">Vissza a termékekhez</Link>
        </Button>
      </div>
    );

  const save = (next: Product) => store.upsertProduct(next);
  const diffs = crossCheck(docs);
  const checks: Check[] = diffs.length
    ? [
        ...ds.checks,
        {
          id: "doc-diff",
          level: "warn",
          text: `Dokumentumok között eltérés van (${diffs.length} mező)`,
        },
      ]
    : ds.checks;
  const counters = stepCounters(checks);
  const goFix = (c: Check) => {
    const t = fixTarget(c);
    setBlocked(null);
    setStep(t.step);
    fixing.current = t.field ?? null;
    setFocusField(t.field ?? null);
    setFocus({ anchor: t.anchor, field: t.field, n: Date.now() });
  };
  const goStep = (dir: 1 | -1) => {
    const i = STEPS.indexOf(step);
    const next = STEPS[i + dir];
    if (!next) return;
    if (dir === 1) {
      const b = blockingFor(step, checks);
      if (b.length) return setBlocked(b);
    }
    setBlocked(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const name = ds.basics.productName.display || p.raw.fileName;
  const pending = p.ingredients.filter((i) => i.status !== "recognized").length;
  const stepDone: Record<Step, boolean> = {
    Források: !ds.checks.some((c) => c.action === "sources"),
    Alapanyagok: pending === 0,
    Adatok: !!ds.weightG && !!ds.basics.productName.display,
    Ellenőrzés: ds.counts.error === 0 && ds.counts.warn === 0,
    Dokumentumok: ds.counts.error === 0,
    Jóváhagyás: p.status === "approved",
  };

  const touch = (next: Product, note: string) => {
    if (next.status === "approved") next.status = "review";
    const cleared = checkerOf(next) ? uncheckProduct(next) : next;
    save(
      bump(
        {
          ...cleared,
          audit: addAudit(cleared, store.settings.userName, `Termék módosítva: ${note}`),
        },
        note,
      ),
    );
  };
  const getValue = (key: string): TracedValue | undefined => {
    if (key === "ingredientText")
      return {
        label: "Összetevők",
        original: null,
        calculated: autoIngredientText(p, store.dictionary, store.settings),
        display: ds.ingredientText,
        origin: p.ingredientTextOverride ? "manual" : "calculated",
        rule: "Összetevő sorrend v1",
        manual:
          p.ingredientTextOverride && p.ingredientTextMeta
            ? { ...p.ingredientTextMeta }
            : undefined,
      };
    if (key.startsWith("n100.")) return ds.nutrition.find((n) => `n100.${n.key}` === key)?.per100;
    return ds.basics[key];
  };
  const api: EditApi = {
    get: getValue,
    focusKey: focusField,
    clearFocus: () => setFocusField(null),
    set: (key, value, note, scope) => {
      if (fixing.current === key) {
        fixing.current = null;
        toast.success("✓ Javítva", {
          action: { label: "Vissza az ellenőrzéshez", onClick: () => setStep("Ellenőrzés") },
        });
      }
      const cur = getValue(key);
      const label = cur?.label ?? key;
      if (scope === "default" && key === "acceptanceRange") {
        store.setSettings({
          ...store.settings,
          companyDefaults: { ...store.settings.companyDefaults, acceptanceRange: value },
        });
        const { [key]: _, ...rest } = p.overrides;
        touch({ ...p, overrides: rest }, `Alapérték módosítva: ${label}`);
        toast.success("Alapérték módosítva minden termékre");
        return;
      }
      const meta = { by: store.settings.userName, at: new Date().toISOString(), note };
      if (key === "ingredientText") {
        const auto = autoIngredientText(p, store.dictionary, store.settings);
        touch(
          {
            ...p,
            ingredientTextOverride: value === auto ? undefined : value,
            ingredientTextMeta: { ...meta, previous: p.ingredientTextMeta?.previous ?? auto },
          },
          "Összetevők szöveg módosítva",
        );
        return;
      }
      const previous = p.overrides[key]?.previous ?? cur?.display ?? "";
      const ack = { ...(p.regulatoryAck ?? {}) };
      delete ack[key];
      touch(
        {
          ...p,
          regulatoryAck: ack,
          overrides: { ...p.overrides, [key]: { value, previous, ...meta } },
        },
        `Manuális módosítás: ${label}`,
      );
    },
    restore: (key) => {
      if (key === "ingredientText")
        return touch(
          { ...p, ingredientTextOverride: undefined, ingredientTextMeta: undefined },
          "Összetevők szöveg visszaállítva",
        );
      const { [key]: _, ...rest } = p.overrides;
      touch(
        { ...p, overrides: rest },
        `Eredeti érték visszaállítva: ${getValue(key)?.label ?? key}`,
      );
    },
  };

  return (
    <EditProvider value={api}>
      <div>
        <Link
          to="/termekek"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Termékek
        </Link>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
            <p className="text-sm text-muted-foreground">
              {p.internalId} · Recept {p.recipeVersion} · Dokumentum {p.docVersion} ·{" "}
              {p.raw.fileName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={p.status} />
            <ProductActions
              id={p.id}
              name={String(name)}
              onDeleted={() => void navigate({ to: "/termekek" })}
            />
          </div>
        </div>

        {/* Hol tartok? */}
        <ol className="mb-8 grid grid-cols-6 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                onClick={() => {
                  setBlocked(null);
                  setStep(s);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:text-sm",
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs font-bold",
                    step === s
                      ? "bg-primary-foreground text-primary"
                      : stepDone[s]
                        ? "bg-success text-primary-foreground"
                        : "bg-background",
                  )}
                >
                  {stepDone[s] && step !== s ? <CheckIcon className="size-3.5" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
                <StepCounter
                  s={s}
                  c={counters[s]}
                  done={stepDone[s]}
                  p={p}
                  diffs={diffs.length}
                  active={step === s}
                  total={openIssues(checks).length}
                  errorsTotal={checks.filter((c) => c.level === "error").length}
                />
              </button>
            </li>
          ))}
        </ol>

        {step === "Források" &&
          (p.files?.length ? (
            <>
              <AiReview p={p} ds={ds} onChange={(next, note) => touch(next, note)} />
              <SourcesStep
                p={p}
                admin={store.admin}
                user={store.settings.userName}
                companyFixed={[
                  { label: "Elfogadhatósági tartomány", value: ds.basics.acceptanceRange.display },
                  { label: "Jogszabályi szöveg", value: ds.basics.legalText.display },
                  { label: "Gyártó", value: ds.basics.manufacturer.display },
                ]}
                onChange={(next, note) => touch(next, note)}
                onTrace={(key, v) => setTrace({ key, v })}
                onNext={() => goStep(1)}
              />
            </>
          ) : (
            <Panel>
              <p className="text-sm text-muted-foreground">
                Ehhez a termékhez csak receptúra tartozik. Specifikációkat új termék létrehozásakor
                lehet csatolni.
              </p>
            </Panel>
          ))}
        {step === "Alapanyagok" && (
          <IngredientsStep p={p} onSave={save} onNext={() => setStep("Adatok")} />
        )}
        {step === "Adatok" && (
          <DataStep
            p={p}
            ds={ds}
            onTrace={(key, v) => setTrace({ key, v })}
            onNext={() => setStep("Ellenőrzés")}
          />
        )}
        {step === "Ellenőrzés" && (
          <ValidationStep
            checks={checks}
            onFix={goFix}
            admin={store.admin}
            onAck={(field) => {
              if (!window.confirm("Megerősíted, hogy a jogi/szakmai ellenőrzés megtörtént?"))
                return;
              touch(
                {
                  ...p,
                  regulatoryAck: {
                    ...(p.regulatoryAck ?? {}),
                    [field]: { by: store.settings.userName, at: new Date().toISOString() },
                  },
                },
                "Jogszabályi ellenőrzés elvégezve",
              );
              toast.success("✓ Javítva");
            }}
          />
        )}
        {step === "Dokumentumok" && (
          <>
            <Completeness
              ds={ds}
              onOpen={(key) =>
                goFix({
                  id: `fill-${key}`,
                  level: "warn",
                  text: key,
                  action: "set-value",
                  field: key,
                })
              }
            />
            <DocsStep docs={docs} onApprove={() => setStep("Jóváhagyás")} />
          </>
        )}
        {step === "Jóváhagyás" && (
          <ApproveStep
            p={p}
            ds={ds}
            docs={docs}
            onBack={() => setStep("Ellenőrzés")}
            onFix={goFix}
            checks={checks}
            user={store.settings.userName}
            onCheck={(on) =>
              save(on ? checkProduct(p, store.settings.userName) : uncheckProduct(p))
            }
            onFinalExport={() =>
              save({
                ...p,
                audit: addAudit(p, store.settings.userName, "Végleges dokumentumok exportálva"),
              })
            }
            onApprove={() => {
              save(bump(approveProduct(p, store.settings.userName), "Jóváhagyva"));
            }}
          />
        )}

        <StepFooter
          step={step}
          blocked={blocked}
          onBack={() => goStep(-1)}
          onNext={() => goStep(1)}
          onFix={goFix}
          onForce={() => {
            setBlocked(null);
            setStep(STEPS[STEPS.indexOf(step) + 1]);
          }}
        />

        <Panel className="mt-8">
          <h2 className="mb-3 font-bold">Verziótörténet</h2>
          <ul className="space-y-1.5 text-sm">
            {[...p.history].reverse().map((h, i) => (
              <li key={i} className="flex gap-4">
                <span className="w-12 font-semibold">{h.version}</span>
                <span className="w-24 text-muted-foreground">{huDate(h.date)}</span>
                <span>{h.note}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <TraceDrawer trace={trace} productId={p.id} onClose={() => setTrace(null)} />
      </div>
    </EditProvider>
  );
}

/* ---------------- Step 1: ingredients ---------------- */

function IngredientsStep({
  p,
  onSave,
  onNext,
}: {
  p: Product;
  onSave: (p: Product) => void;
  onNext: () => void;
}) {
  const { dictionary, upsertEntry } = useStore();
  const [active, setActive] = useState<ResolvedIngredient | null>(null);
  const [specOpen, setSpecOpen] = useState<SourceFile | null>(null);
  const byId = new Map(dictionary.map((d) => [d.id, d]));
  const sorted = [...p.ingredients].sort(
    (a, b) =>
      ["unknown", "review", "recognized"].indexOf(a.status) -
      ["unknown", "review", "recognized"].indexOf(b.status),
  );
  const pending = p.ingredients.filter((i) => i.status !== "recognized").length;

  const update = (row: number, patch: Partial<ResolvedIngredient>, note: string) =>
    onSave(
      bump(
        {
          ...p,
          ingredients: p.ingredients.map((i) => (i.raw.row === row ? { ...i, ...patch } : i)),
        },
        note,
      ),
    );

  const specs = specFiles(p);
  return (
    <Panel>
      <div className="mb-4 space-y-3">
        <h2 className="text-lg font-bold">Alapanyagok</h2>
        <div className="rounded-xl border px-4 py-3">
          <div className="font-semibold">Recept alapanyagok</div>
          <p className="text-sm">
            {pending
              ? `${pending} recept-alapanyag vár döntésre`
              : "✓ Minden recept-alapanyag felismerve"}
          </p>
        </div>
        <SpecSummary p={p} />
      </div>
      <ul data-anchor="ingredients" className="divide-y rounded-xl border">
        {sorted.map((i) => {
          const e = i.entryId ? byId.get(i.entryId) : undefined;
          const spec = specs.find((f) => f.linkRow === i.raw.row && f.linkState !== "rejected");
          return (
            <li
              key={i.raw.row}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{i.raw.name}</div>
                <div className="text-xs text-muted-foreground">
                  {i.raw.code || "nincs kód"} · {i.raw.producer || "—"} ·{" "}
                  {huNumber(i.raw.quantity ?? 0, 2)} kg ({huNumber(i.percentage, 1)} %)
                </div>
                {e && (
                  <div className="mt-1 text-sm">
                    → <b>{e.packagingName}</b>
                    {e.allergen && (
                      <span className="ml-2 text-xs font-semibold uppercase text-primary">
                        allergén: {e.allergen}
                      </span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!spec}
                  onClick={() => spec && setSpecOpen(spec)}
                  className={cn(
                    "mt-1 block text-left text-xs",
                    spec
                      ? "text-primary underline-offset-2 hover:underline"
                      : "text-muted-foreground",
                  )}
                >
                  {spec
                    ? `Kapcsolt specifikáció: ${spec.name} · ${spec.fields.length} mező · ${
                        specStats(spec).review + specStats(spec).unclassified
                          ? `! ${specStats(spec).review + specStats(spec).unclassified} ellenőrizendő`
                          : "✓"
                      }${spec.linkState === "suggested" ? " (bizonytalan kapcsolat)" : ""}`
                    : "Nincs kapcsolt specifikáció"}
                </button>
                {i.deferred && (
                  <div className="mt-1 text-xs font-semibold text-destructive">
                    Későbbi ellenőrzésre félretéve
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <MatchPill status={i.status} />
                {i.status === "review" && e && (
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      update(
                        i.raw.row,
                        { status: "recognized", deferred: false },
                        `Alapanyag elfogadva: ${i.raw.name}`,
                      )
                    }
                  >
                    Elfogadás
                  </Button>
                )}
                {i.status !== "recognized" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setActive(i)}
                  >
                    Megoldás
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <SpecDrawer file={specOpen} onClose={() => setSpecOpen(null)} />
      <ResolveDialog
        ing={active}
        dictionary={dictionary}
        onClose={() => setActive(null)}
        onDefer={() => {
          if (active)
            update(active.raw.row, { deferred: true }, `Későbbi ellenőrzés: ${active.raw.name}`);
          setActive(null);
        }}
        onMap={(entryId, saveAlias) => {
          if (!active) return;
          if (saveAlias) {
            const e = byId.get(entryId)!;
            upsertEntry({ ...e, aliases: [...new Set([...e.aliases, active.raw.name])] });
          }
          update(
            active.raw.row,
            { status: "recognized", entryId, deferred: false },
            `Alapanyag megfeleltetve: ${active.raw.name}`,
          );
          toast.success(saveAlias ? "Megfeleltetve és mentve a szótárba" : "Megfeleltetve");
          setActive(null);
        }}
        onCreate={(entry) => {
          if (!active) return;
          upsertEntry(entry);
          update(
            active.raw.row,
            { status: "recognized", entryId: entry.id, deferred: false },
            `Új alapanyag: ${entry.packagingName}`,
          );
          toast.success("Új alapanyag mentve a szótárba");
          setActive(null);
        }}
      />
    </Panel>
  );
}

function ResolveDialog({
  ing,
  dictionary,
  onClose,
  onDefer,
  onMap,
  onCreate,
}: {
  ing: ResolvedIngredient | null;
  dictionary: DictionaryEntry[];
  onClose: () => void;
  onDefer: () => void;
  onMap: (entryId: string, saveAlias: boolean) => void;
  onCreate: (e: DictionaryEntry) => void;
}) {
  const [mode, setMode] = useState<"map" | "new">("map");
  const [entryId, setEntryId] = useState("");
  const [saveAlias, setSaveAlias] = useState(true);
  const [pack, setPack] = useState("");
  const [allergen, setAllergen] = useState("");
  const [pct, setPct] = useState(false);
  const [sub, setSub] = useState("");

  return (
    <Dialog
      open={!!ing}
      onOpenChange={(o) => {
        if (!o) onClose();
        else {
          setEntryId(ing?.entryId ?? "");
          setPack("");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ing?.status === "unknown" ? "Ismeretlen alapanyag" : "Ellenőrizendő alapanyag"}
          </DialogTitle>
        </DialogHeader>
        <p className="rounded-xl bg-muted px-3 py-2 font-semibold">„{ing?.raw.name}”</p>
        <div className="grid grid-cols-2 gap-2">
          {(["map", "new"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-sm font-medium",
                mode === m ? "border-primary bg-accent text-accent-foreground" : "",
              )}
            >
              {m === "map" ? "Megfeleltetés meglévő alapanyaghoz" : "Új alapanyag létrehozása"}
            </button>
          ))}
        </div>
        {mode === "map" ? (
          <div className="space-y-3">
            <Select value={entryId} onValueChange={setEntryId}>
              <SelectTrigger>
                <SelectValue placeholder="Válassz alapanyagot a szótárból" />
              </SelectTrigger>
              <SelectContent>
                {dictionary.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.technicalName} → {d.packagingName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={saveAlias} onCheckedChange={(v) => setSaveAlias(!!v)} /> Mentés az
              alapanyag szótárba (következő alkalommal automatikusan felismerve)
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Csomagolási megnevezés</Label>
              <Input
                value={pack}
                onChange={(e) => setPack(e.target.value)}
                placeholder="pl. tejsavófehérje-koncentrátum"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Allergén</Label>
                <Input
                  value={allergen}
                  onChange={(e) => setAllergen(e.target.value)}
                  placeholder="pl. tej"
                />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <Checkbox checked={pct} onCheckedChange={(v) => setPct(!!v)} /> Százalék
                megjelenítése
              </label>
            </div>
            <div>
              <Label>Összetevői (opcionális)</Label>
              <Input value={sub} onChange={(e) => setSub(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="rounded-full" onClick={onDefer}>
            Későbbi ellenőrzés
          </Button>
          {mode === "map" ? (
            <Button
              className="rounded-full"
              disabled={!entryId}
              onClick={() => onMap(entryId, saveAlias)}
            >
              Megfeleltetés
            </Button>
          ) : (
            <Button
              className="rounded-full"
              disabled={!pack.trim()}
              onClick={() =>
                onCreate({
                  id: `d-${uid()}`,
                  technicalName: ing!.raw.name,
                  aliases: ing!.raw.code ? [ing!.raw.code] : [],
                  canonicalName: pack.trim().toLowerCase(),
                  packagingName: pack.trim(),
                  materialCode: ing!.raw.code,
                  manufacturer: ing!.raw.producer,
                  allergen: allergen.trim() || undefined,
                  subIngredients: sub.trim() || undefined,
                  showPercentage: pct,
                  status: "approved",
                })
              }
            >
              Mentés az alapanyag szótárba
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Step 2: data ---------------- */

function FieldRow({
  k,
  v,
  onTrace,
}: {
  k: string;
  v: TracedValue;
  onTrace: (key: string, v: TracedValue) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <button
        onClick={() => onTrace(k, v)}
        className="w-40 shrink-0 pt-0.5 text-left text-sm text-muted-foreground hover:text-foreground sm:w-48"
        title="Forrás és szabály megtekintése"
      >
        {v.label}
      </button>
      <div className="min-w-0 flex-1 font-semibold">
        <InlineField fieldKey={k} block={(v.display?.length ?? 0) > 50} emptyText="hiányzik" />
      </div>
    </div>
  );
}

function DataStep({
  ds,
  onTrace,
  onNext,
}: {
  p: Product;
  ds: ReturnType<typeof buildDataset>;
  onTrace: (key: string, v: TracedValue) => void;
  onNext: () => void;
}) {
  const b = ds.basics;
  const groups: [string, string[]][] = [
    [
      "Alapadatok",
      [
        "productName",
        "marketingName",
        "description",
        "recipeVersion",
        "productWeight",
        "servingSize",
        "texture",
        "totalSolids",
        "losses",
        "acceptanceRange",
      ],
    ],
    ["Csomagolási adatok", ["packaging", "storageMode", "storage", "manufacturer", "distributor"]],
    [
      "Allergének és jogszabályi adatok",
      ["allergenList", "bestBeforeWording", "legalRef", "legalText"],
    ],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {groups.map(([title, keys]) => (
          <Panel key={title} className="p-0">
            <h2 className="px-5 pb-2 pt-5 text-lg font-bold">{title}</h2>
            <div className="divide-y border-t">
              {keys.map((k) => b[k] && <FieldRow key={k} k={k} v={b[k]} onTrace={onTrace} />)}
            </div>
          </Panel>
        ))}
      </div>

      <div className="space-y-6">
        <Panel className="p-0">
          <h2 className="px-5 pb-2 pt-5 text-lg font-bold">Tápérték</h2>
          <div className="grid grid-cols-[1fr_auto_auto] items-center border-t text-sm">
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">Megnevezés</div>
            <div className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
              100 g
            </div>
            <div className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">
              {ds.weightG ? `${huNumber(ds.weightG, 0)} g` : "termék"}
            </div>
            {ds.nutrition.map((n) => (
              <div key={n.key} className="contents">
                <button
                  onClick={() => onTrace(`n100.${n.key}`, n.per100)}
                  className={cn(
                    "border-t px-4 py-2.5 text-left hover:text-foreground",
                    n.key === "saturates" || n.key === "sugars" ? "pl-8 text-muted-foreground" : "",
                  )}
                >
                  {n.per100.label}
                </button>
                <div className="border-t px-3 py-2.5 text-right font-semibold">
                  <InlineField fieldKey={`n100.${n.key}`} />
                </div>
                <button
                  className="border-t px-4 py-2.5 text-right hover:bg-muted/60"
                  disabled={!n.perServing}
                  onClick={() => n.perServing && onTrace(`ns.${n.key}`, n.perServing)}
                >
                  {n.perServing?.display ?? "—"}
                </button>
              </div>
            ))}
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            A megnevezésre kattintva látod a forrást és az alkalmazott szabályt.
          </p>
        </Panel>

        <Panel>
          <h2 className="mb-3 text-lg font-bold">Összetevők</h2>
          <InlineField fieldKey="ingredientText" block>
            <p className="leading-relaxed">
              {ds.ingredientSegments.map((s, i) =>
                s.emph ? <b key={i}>{s.text}</b> : <span key={i}>{s.text}</span>,
              )}
            </p>
          </InlineField>
        </Panel>
      </div>
    </div>
  );
}

function TraceDrawer({
  trace,
  productId,
  onClose,
}: {
  productId: string;
  trace: { key: string; v: TracedValue } | null;
  onClose: () => void;
}) {
  const v = trace?.v;
  const rows: [string, string][] = v
    ? [
        ["Forrásfájl", v.source?.file ?? "—"],
        ["Forrástípus", v.source?.sourceType ?? (v.source ? "Receptúra" : "—")],
        ["Oldal", v.source?.page ? String(v.source.page) : "—"],
        ["Munkalap", v.source?.sheet ?? "—"],
        ["Forrás", v.source?.cell ?? (v.origin === "calculated" ? "számított érték" : "—")],
        ["Eredeti érték", v.original == null ? "—" : String(v.original)],
        [
          "Számított érték",
          typeof v.calculated === "number"
            ? String(Math.round(v.calculated * 10000) / 10000)
            : (v.calculated ?? "—"),
        ],
        ["Alkalmazott szabály", v.rule ?? "—"],
        ["Végleges érték", v.display || "—"],
      ]
    : [];
  return (
    <Sheet open={!!trace} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {v && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {v.label} <OriginTag origin={v.origin} />
              </SheetTitle>
            </SheetHeader>
            <p className="mt-2 text-3xl font-bold">
              {v.display || <span className="text-destructive">hiányzik</span>}
            </p>
            <dl className="mt-6 divide-y rounded-xl border text-sm">
              {rows.map(([k, x]) => (
                <div key={k} className="flex gap-3 px-3 py-2.5">
                  <dt className="w-36 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="break-words font-medium">{x}</dd>
                </div>
              ))}
            </dl>
            {(v.source?.fileId || v.source?.sheet) && (
              <Button
                variant="outline"
                className="mt-4 rounded-full"
                onClick={() => {
                  void openSource(v.source?.fileId ?? recipeFileId(productId), v.source?.page).then(
                    (ok) => {
                      if (!ok)
                        toast.info(
                          "Az eredeti fájl nincs eltárolva ezen az eszközön (demó adat vagy korábbi feltöltés).",
                        );
                    },
                  );
                }}
              >
                Forrás megnyitása
              </Button>
            )}
            {v.manual && (
              <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
                <p className="font-semibold">Manuálisan módosított</p>
                <p>Előző érték: {v.manual.previous || "—"}</p>
                <p>
                  {v.manual.by} · {huDate(v.manual.at)}
                </p>
                {v.manual.note && <p>Megjegyzés: {v.manual.note}</p>}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Step 4/5 ---------------- */

type Docs = ReturnType<typeof buildDocs>;

function DocsStep({ docs, onApprove }: { docs: Docs; onApprove: () => void }) {
  const [tab, setTab] = useState<keyof Docs>("sheet");
  const diffs = crossCheck(docs);
  return (
    <div className="space-y-5">
      <Panel>
        <h2 className="mb-4 text-lg font-bold">Dokumentumok</h2>
        <ul className="divide-y">
          {(Object.keys(DOC_TITLES) as (keyof Docs)[]).map((k) => (
            <li key={k} className="flex flex-wrap items-center gap-3 py-3">
              <button
                onClick={() => setTab(k)}
                className={cn("flex-1 text-left font-semibold", tab === k && "text-primary")}
              >
                {DOC_TITLES[k]}
              </button>
              <span className="text-sm font-semibold text-success">✓ kész</span>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => exportDocx(docs[k])}
              >
                <Download className="size-4" /> Tervezet letöltése
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => exportAll([docs.sheet, docs.spec, docs.pack])}
          >
            <Download className="size-4" /> Mindhárom tervezet
          </Button>
          <Button className="rounded-full" onClick={onApprove}>
            Jóváhagyás
          </Button>
        </div>
      </Panel>
      <Panel>
        <div data-anchor="doc-diffs" className="mb-2 flex items-center justify-between rounded-lg">
          <h2 className="font-bold">Dokumentumok összevetése</h2>
          <LevelIcon level={diffs.length ? "warn" : "ok"} className="size-6" />
        </div>
        {diffs.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Mező</th>
                <th>GYL</th>
                <th>SPEC</th>
                <th>Szövegterv</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {diffs.map((d) => (
                <tr key={d.field}>
                  <td className="py-1.5 font-medium">! {d.field}</td>
                  <td>{d.sheet}</td>
                  <td>{d.spec}</td>
                  <td>{d.pack ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">
            A három dokumentum ugyanabból az adatkészletből készül – nincs eltérés.
          </p>
        )}
      </Panel>
      <div className="inline-flex rounded-full bg-muted p-1">
        {(Object.keys(DOC_TITLES) as (keyof Docs)[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium sm:px-4",
              tab === k ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {DOC_TITLES[k]}
          </button>
        ))}
      </div>
      <DocPreview doc={docs[tab]} />
    </div>
  );
}

function FourEyes({
  p,
  user,
  onCheck,
}: {
  p: Product;
  user: string;
  onCheck: (on: boolean) => void;
}) {
  const checker = checkerOf(p);
  const allowed = canCheck(p, user);
  const fmt = (s?: string) =>
    s ? new Date(s).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" }) : "";
  return (
    <section aria-label="ELLENŐRZÉS ÉS JÓVÁHAGYÁS" className="my-6 rounded-xl border p-4 text-sm">
      <h3 className="mb-3 text-xs font-bold tracking-wide text-muted-foreground">
        ELLENŐRZÉS ÉS JÓVÁHAGYÁS
      </h3>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">Készítő</dt>
        <dd className="font-medium">{p.createdBy}</dd>
        <dt className="text-muted-foreground">Ellenőr</dt>
        <dd>
          {checker ? (
            <>
              <span className="font-medium">{checker}</span>
              <span className="ml-2 font-semibold text-success">✓ Ellenőrizve</span>
              <span className="ml-2 text-muted-foreground">{fmt(p.checkedAt)}</span>
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-muted-foreground">Jóváhagyás</dt>
        <dd>{p.approvedBy ? `${p.approvedBy} · ${fmt(p.approvedAt)}` : "—"}</dd>
      </dl>
      {p.status !== "approved" && (
        <label className="mt-4 flex items-start gap-2">
          <Checkbox
            aria-label="Ellenőriztem a termék adatait és az elkészült dokumentumokat"
            checked={!!checker}
            disabled={!allowed}
            onCheckedChange={(v) => onCheck(!!v)}
          />
          <span className={allowed ? "" : "text-muted-foreground"}>
            Ellenőriztem a termék adatait és az elkészült dokumentumokat
          </span>
        </label>
      )}
      {!allowed && p.status !== "approved" && (
        <p className="mt-2 text-xs text-destructive">{SAME_PERSON}</p>
      )}
    </section>
  );
}

function ExportButtons({
  docs,
  final = false,
  onFinal,
  sign,
}: {
  docs: Docs;
  final?: boolean;
  onFinal?: () => void;
  sign?: import("@/lib/recipe/docx").ExportSign;
}) {
  const one = (d: Docs[keyof Docs]) => {
    exportDocx(d, final, sign);
    if (final) onFinal?.();
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <p className="text-xs font-bold tracking-wide text-muted-foreground sm:col-span-2">
        {final ? "VÉGLEGES EXPORT" : "TERVEZET EXPORT"}
      </p>
      <Button variant="outline" className="h-12 rounded-full" onClick={() => one(docs.sheet)}>
        <Download className="size-4" /> Gyártmánylap letöltése
      </Button>
      <Button variant="outline" className="h-12 rounded-full" onClick={() => one(docs.spec)}>
        <Download className="size-4" /> Késztermék specifikáció letöltése
      </Button>
      <Button variant="outline" className="h-12 rounded-full" onClick={() => one(docs.pack)}>
        <Download className="size-4" /> Szövegterv letöltése
      </Button>
      <Button
        className="h-12 rounded-full"
        onClick={() => {
          exportAll([docs.sheet, docs.spec, docs.pack], final, sign);
          if (final) onFinal?.();
        }}
      >
        <Download className="size-4" /> Összes dokumentum exportálása
      </Button>
    </div>
  );
}

function ApproveStep({
  p,
  ds,
  docs,
  onApprove,
  onBack,
  onFix,
  checks,
  user,
  onCheck,
  onFinalExport,
  sign,
}: {
  onFix: (c: Check) => void;
  checks: Check[];
  p: Product;
  ds: ReturnType<typeof buildDataset>;
  docs: Docs;
  onApprove: () => void;
  onBack: () => void;
  user: string;
  onCheck: (on: boolean) => void;
  onFinalExport: () => void;
  sign: import("@/lib/recipe/docx").ExportSign;
}) {
  const name = ds.basics.productName.display;
  const finalOk = finalExportAllowed(p, ds.counts.error);
  if (p.status === "approved")
    return (
      <Panel className="mx-auto max-w-2xl">
        <p className="flex items-center gap-2 text-2xl font-bold text-success">
          Jóváhagyva <CheckIcon className="size-6" />
        </p>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          {name} · {p.docVersion} · {p.approvedBy} · {huDate(p.approvedAt ?? p.updatedAt)}
        </p>
        <FourEyes p={p} user={user} onCheck={onCheck} />
        <ExportButtons docs={docs} final={finalOk} onFinal={onFinalExport} sign={sign} />
      </Panel>
    );
  const has = (ids: string[]) => ds.checks.filter((c) => ids.includes(c.id) && c.level !== "ok");
  const rows: [string, ReturnType<typeof has>][] = [
    ["Recept", has(["recipe", "qty", "name", "weight"])],
    ["Alapanyagok", has(["rev", "unk", "def"])],
    ["Tápérték", has(["energy"])],
    ["Csomagolási szöveg", has(["mkt", "mfr", "txt"])],
    ["Dokumentumok", has(ds.checks.filter((c) => c.id.startsWith("reg-")).map((c) => c.id))],
  ];
  const blockers = approvalBlockers(p, ds.counts.error, user);
  const blocked = blockers.length > 0;
  return (
    <Panel className="mx-auto max-w-2xl">
      <h2 className="text-2xl font-bold">{name}</h2>
      <ul className="my-6 divide-y rounded-xl border">
        {rows.map(([l, issues]) => {
          const level = issues.some((i) => i.level === "error")
            ? "error"
            : issues.length
              ? "warn"
              : "ok";
          return (
            <li key={l} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 font-medium">{l}</span>
              {issues.length > 0 && (
                <span className="text-right text-xs text-muted-foreground">
                  {issues.map((i) => i.text).join(" · ")}
                </span>
              )}
              <LevelIcon level={level} />
            </li>
          );
        })}
      </ul>
      <p className="mb-6 text-sm">
        <b className={ds.counts.error ? "text-destructive" : ""}>{ds.counts.error} hiba</b> ·{" "}
        <b>
          {ds.counts.warn - (ds.checks.some((c) => c.id === "src-reg") ? 1 : 0)} ellenőrizendő adat
        </b>
        {(() => {
          const t = ds.checks.find((c) => c.id === "src-reg")?.text;
          return t ? <span className="text-muted-foreground"> · {t}</span> : null;
        })()}
      </p>
      <FourEyes p={p} user={user} onCheck={onCheck} />
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="self-center text-xs font-bold text-muted-foreground">TERVEZET EXPORT</span>
        {(["sheet", "spec", "pack"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => exportDocx(docs[k])}
          >
            <Download className="size-4" /> {DOC_TITLES[k]}
          </Button>
        ))}
      </div>
      {blockers
        .filter((b) => !b.includes("blokkoló"))
        .map((b) => (
          <p
            key={b}
            role="alert"
            className="mb-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-destructive"
          >
            {b}
          </p>
        ))}
      {ds.counts.error > 0 && (
        <div className="mb-4">
          <p className="mb-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-destructive">
            Jóváhagyás csak a hibák javítása után lehetséges.
          </p>
          <ul className="space-y-2">
            {checks
              .filter((c) => c.level === "error")
              .map((c) => (
                <IssueRow key={c.id} c={c} onFix={onFix} />
              ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="rounded-full" onClick={onBack}>
          Vissza az ellenőrzéshez
        </Button>
        <Button
          size="lg"
          className="rounded-full px-10 font-bold tracking-wide"
          disabled={blocked}
          onClick={onApprove}
        >
          JÓVÁHAGYÁS
        </Button>
      </div>
    </Panel>
  );
}
