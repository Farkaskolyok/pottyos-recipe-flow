import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import { FileSpreadsheet, Upload, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/rf/ui";
import { useStore } from "@/lib/store";
import { IMPORT_TEMPLATES, parseWorkbook, readWorkbook } from "@/lib/recipe/parse";
import { DEMO_RECIPES, demoFile, newProduct } from "@/lib/recipe/demo";
import { fileSize } from "@/lib/recipe/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/uj")({
  head: () => ({
    meta: [
      { title: "Új termék – PÖTTYÖS RecipeFlow" },
      { name: "description", content: "Recept XLS/XLSX feltöltése és helyi feldolgozása." },
      { property: "og:title", content: "Új termék – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Recept XLS/XLSX feltöltése és helyi feldolgozása." },
    ],
  }),
  component: NewProduct,
});

function NewProduct() {
  const { dictionary, settings, upsertProduct } = useStore();
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [wb, setWb] = useState<WorkBook | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [tpl, setTpl] = useState<string>("");

  async function load(f: File) {
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast.error("Csak XLS vagy XLSX fájl tölthető fel.");
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

  function process() {
    if (!file || !wb) return;
    const raw = parseWorkbook(wb, file.name, file.size);
    if (!raw.templateId) raw.templateId = tpl || null;
    const p = newProduct(raw, dictionary, settings.userName);
    p.status = "review";
    upsertProduct(p);
    nav({ to: "/termekek/$id", params: { id: p.id } });
  }

  async function downloadDemo() {
    const f = demoFile(DEMO_RECIPES[0]);
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Recept feltöltése" subtitle="1. lépés: válaszd ki a jóváhagyott receptet." />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) load(f);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          drag ? "border-primary bg-accent" : "border-border bg-muted/40",
        )}
      >
        <span className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-background shadow-[var(--shadow-soft)]">
          <Upload className="size-7 text-primary" />
        </span>
        <p className="text-lg font-semibold">Húzd ide a recept XLS/XLSX fájlt</p>
        <p className="my-3 text-sm text-muted-foreground">vagy</p>
        <Button size="lg" className="rounded-full px-6" onClick={() => input.current?.click()}>
          Fájl kiválasztása
        </Button>
        <input ref={input} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-success" /> A fájl a böngészőben kerül feldolgozásra, nem töltődik fel sehova.
        </p>
      </div>

      {file && wb && (
        <Panel className="mt-6">
          <div className="flex items-start gap-4">
            <FileSpreadsheet className="mt-0.5 size-8 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{file.name}</div>
              <div className="text-sm text-muted-foreground">{fileSize(file.size)}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {wb.SheetNames.map((s) => (
                  <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 border-t pt-4 text-sm">
            {detected ? (
              <p>
                Felismert szerkezet: <b>{IMPORT_TEMPLATES.find((t) => t.id === detected)?.name}</b>
              </p>
            ) : (
              <div className="space-y-2">
                <p className="font-medium text-warning">A fájl szerkezete nem egyértelmű. Válaszd ki a megfelelő importsablont:</p>
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
          </div>
          <div className="mt-5 flex justify-end">
            <Button size="lg" className="rounded-full px-8" disabled={!detected && !tpl} onClick={process}>
              Feldolgozás
            </Button>
          </div>
        </Panel>
      )}

      <div className="mt-8 rounded-2xl border p-5">
        <h2 className="font-semibold">Nincs kéznél recept?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Próbáld ki egy fiktív demó recepttel (egy ismeretlen és egy ellenőrizendő alapanyaggal).</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" className="rounded-full" onClick={() => load(demoFile(DEMO_RECIPES[0]))}>
            Demó recept betöltése
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={downloadDemo}>
            <Download className="size-4" /> Demó XLSX letöltése
          </Button>
        </div>
      </div>
    </div>
  );
}
