import { saveFileBlob } from "@/lib/idb";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import type { WorkBook } from "xlsx";
import { FileSpreadsheet, FileText, Plus, ShieldCheck, X, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/rf/ui";
import { FileStatusBadge } from "@/components/rf/SourceBits";
import { useStore } from "@/lib/store";
import { IMPORT_TEMPLATES, parseWorkbook, readWorkbook } from "@/lib/recipe/parse";
import { DEMO_RECIPES, demoFile, newProduct } from "@/lib/recipe/demo";
import {
  ensureDemoSourceBlobs,
  applyLinkSuggestions,
  demoSpecFiles,
  processFile,
  SOURCE_TYPE_LABELS,
  type SourceFile,
  type SourceType,
  deleteSourceFile,
  recipeFileId,
} from "@/lib/recipe/sources";
import { fileSize } from "@/lib/recipe/format";

export const Route = createFileRoute("/uj")({
  head: () => ({
    meta: [
      { title: "Új termék – PÖTTYÖS RecipeFlow" },
      {
        name: "description",
        content:
          "Receptúra, alapanyag specifikációk és referenciák helyi feldolgozása egy termékcsomagban.",
      },
      { property: "og:title", content: "Új termék – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Termékcsomag feltöltése és helyi feldolgozása." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewProduct,
});

const SPEC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx";

function NewProduct() {
  const { dictionary, settings, upsertProduct } = useStore();
  const nav = useNavigate();
  const recipeInput = useRef<HTMLInputElement>(null);
  const specInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [wb, setWb] = useState<WorkBook | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [tpl, setTpl] = useState("");
  const [specs, setSpecs] = useState<SourceFile[]>([]);
  const [refs, setRefs] = useState<SourceFile[]>([]);
  const [busy, setBusy] = useState(0);

  async function loadRecipe(f: File) {
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast.error("Receptúraként csak XLS vagy XLSX fájl tölthető fel.");
      return;
    }
    try {
      const w = await readWorkbook(f);
      setFile(f);
      setWb(w);
      const probe = parseWorkbook(w, f.name, f.size);
      setDetected(probe.templateId);
      setTpl(probe.templateId ?? "");
    } catch {
      toast.error("A fájl nem olvasható be.");
    }
  }

  async function addFiles(list: FileList | null, section: "spec" | "reference") {
    if (!list) return;
    for (const f of Array.from(list)) {
      if (!/\.(pdf|docx?|xlsx?)$/i.test(f.name)) {
        toast.error(`${f.name}: nem támogatott formátum`);
        continue;
      }
      setBusy((b) => b + 1);
      const sf = await processFile(f, section);
      (section === "spec" ? setSpecs : setRefs)((x) => [...x, sf]);
      setBusy((b) => b - 1);
    }
  }

  function process() {
    if (!file || !wb) return;
    const raw = parseWorkbook(wb, file.name, file.size);
    if (!raw.templateId) raw.templateId = tpl || null;
    const p = newProduct(raw, dictionary, settings.userName);
    p.files = applyLinkSuggestions(
      [...specs, ...refs],
      p.ingredients.map((i) => ({ row: i.raw.row, name: i.raw.name })),
    );
    p.status = "review";
    p.audit = [
      {
        at: p.createdAt,
        by: settings.userName,
        text: `Termékcsomag helyben feldolgozva (${1 + specs.length + refs.length} fájl)`,
      },
    ];
    p.history = [
      {
        version: "v1.0",
        date: p.createdAt,
        note: `Termékcsomag beolvasva (1 recept, ${specs.length} specifikáció)`,
      },
    ];
    void saveFileBlob(recipeFileId(p.id), file, file.name).catch(() => {});
    upsertProduct(p);
    nav({ to: "/termekek/$id", params: { id: p.id } });
  }

  function loadDemo() {
    loadRecipe(demoFile(DEMO_RECIPES[3]));
    const d = demoSpecFiles();
    void ensureDemoSourceBlobs(d);
    setSpecs(d);
  }

  function downloadDemo() {
    const f = demoFile(DEMO_RECIPES[3]);
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const setType = (id: string, t: SourceType) =>
    setSpecs((x) => x.map((f) => (f.id === id ? { ...f, sourceType: t } : f)));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Új termék"
        subtitle="Töltsd fel a termékcsomagot. A rendszer rendszerezi, te csak az eltéréseket javítod."
      />

      <div className="space-y-4">
        <Section n={1} title="Receptúra" hint="XLS / XLSX">
          {file ? (
            <FileLine
              icon={<FileSpreadsheet className="size-5 text-success" />}
              name={file.name}
              meta={fileSize(file.size)}
              status={<FileStatusBadge status="ok" label="Betöltve" />}
              onRemove={() => {
                setFile(null);
                setWb(null);
              }}
            />
          ) : (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => recipeInput.current?.click()}
            >
              <Plus className="size-4" /> XLS / XLSX feltöltése
            </Button>
          )}
          {file && wb && !detected && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-warning">
                A fájl szerkezete nem egyértelmű. Válaszd ki az importsablont:
              </p>
              <Select value={tpl} onValueChange={setTpl}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Importsablon" />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <input
            ref={recipeInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) loadRecipe(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </Section>

        <Section n={2} title="Alapanyag specifikációk" hint="PDF, DOC, DOCX, XLS, XLSX">
          <ul className="space-y-2">
            {specs.map((s) => (
              <li key={s.id}>
                <FileLine
                  icon={<FileText className="size-5 text-muted-foreground" />}
                  name={s.name}
                  meta={
                    <Select
                      value={s.sourceType}
                      onValueChange={(v) => setType(s.id, v as SourceType)}
                    >
                      <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-0 text-xs text-muted-foreground shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          [
                            "SUPPLIER_SPECIFICATION",
                            "RAW_MATERIAL_SPECIFICATION",
                            "COMPANY_MASTER",
                            "REGULATORY_SOURCE",
                          ] as SourceType[]
                        ).map((t) => (
                          <SelectItem key={t} value={t}>
                            {SOURCE_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                  status={<FileStatusBadge status={s.status} />}
                  onRemove={() => {
                    void deleteSourceFile(s.id);
                    setSpecs((x) => x.filter((f) => f.id !== s.id));
                  }}
                />
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            className="mt-2 rounded-full"
            onClick={() => specInput.current?.click()}
          >
            <Plus className="size-4" /> Dokumentum hozzáadása
          </Button>
          <input
            ref={specInput}
            type="file"
            multiple
            accept={SPEC_ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files, "spec");
              e.target.value = "";
            }}
          />
        </Section>

        <Section
          n={3}
          title="Korábbi referencia"
          hint="Opcionális – korábbi gyártmánylap, specifikáció, csomagolási szöveg"
        >
          <ul className="space-y-2">
            {refs.map((s) => (
              <li key={s.id}>
                <FileLine
                  icon={<FileText className="size-5 text-muted-foreground" />}
                  name={s.name}
                  meta={SOURCE_TYPE_LABELS[s.sourceType]}
                  status={<FileStatusBadge status={s.status} />}
                  onRemove={() => {
                    void deleteSourceFile(s.id);
                    setRefs((x) => x.filter((f) => f.id !== s.id));
                  }}
                />
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            className="mt-2 rounded-full"
            onClick={() => refInput.current?.click()}
          >
            <Plus className="size-4" /> Referencia hozzáadása
          </Button>
          <input
            ref={refInput}
            type="file"
            multiple
            accept={SPEC_ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files, "reference");
              e.target.value = "";
            }}
          />
        </Section>
      </div>

      <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-success" /> Minden fájl a böngészőben kerül
        feldolgozásra, nem töltődik fel sehova.
      </p>

      <div className="mt-6 flex justify-end">
        <Button
          size="lg"
          className="rounded-full px-10"
          disabled={!file || (!detected && !tpl) || busy > 0}
          onClick={process}
        >
          {busy > 0 && <Loader2 className="size-4 animate-spin" />} FELDOLGOZÁS
        </Button>
      </div>

      <div className="mt-10 rounded-2xl border p-5">
        <h2 className="font-semibold">Demó termékcsomag</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fiktív recept és 4 fiktív specifikáció – kapcsolással, ütköző értékkel, nem besorolt
          adattal és jogszabályi figyelmeztetéssel.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" className="rounded-full" onClick={loadDemo}>
            Demó csomag betöltése
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={downloadDemo}>
            <Download className="size-4" /> Demó recept letöltése
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {n}
        </span>
        <div>
          <h2 className="font-bold uppercase tracking-wide">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </Panel>
  );
}

function FileLine({
  icon,
  name,
  meta,
  status,
  onRemove,
}: {
  icon: ReactNode;
  name: string;
  meta: ReactNode;
  status: ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border px-3 py-2">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{meta}</div>
      </div>
      {status}
      <button
        onClick={onRemove}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted"
        aria-label="Eltávolítás"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
