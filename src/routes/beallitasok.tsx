import { ruleCandidates } from "@/lib/recipe/ai";
import { ModeSwitch } from "@/components/rf/ModeSwitch";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { idbAvailable, storageEstimate } from "@/lib/idb";
import { createBackup, downloadBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { templatesStoredLocally } from "@/lib/recipe/docxTemplate";
import type { State } from "@/lib/store";
import { PageHeader, Panel } from "@/components/rf/ui";

export const Route = createFileRoute("/beallitasok")({
  head: () => ({
    meta: [
      { title: "Beállítások – PÖTTYÖS RecipeFlow" },
      {
        name: "description",
        content: "Felhasználó, gyártói adatok, tárolási szöveg és demó adatok kezelése.",
      },
      { property: "og:title", content: "Beállítások – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Alkalmazás beállítások." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const store = useStore();
  const { settings, setSettings, admin, setAdmin, resetDemo } = store;
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tplLocal, setTplLocal] = useState<boolean | null>(null);
  async function doBackup() {
    setBusy(true);
    try {
      const state: State = {
        products: store.allProducts,
        dictionary: store.allDictionary,
        settings: store.rawSettings,
        demoMode: store.demoMode,
        rules: store.rules,
        admin: store.admin,
        categories: store.categories,
      };
      const b = await createBackup(state);
      downloadBackup(b);
      toast.success(`Helyi mentés elkészült (${b.files.length} fájl)`);
    } catch {
      toast.error("A mentés nem sikerült.");
    } finally {
      setBusy(false);
    }
  }
  async function doRestore(f: File) {
    setBusy(true);
    try {
      const b = parseBackup(await f.text());
      if (
        !window.confirm(
          `Visszaállítás: ${(b.state as State).products.length} termék, ${b.files.length} fájl (${b.createdAt.slice(0, 10)}). A jelenlegi helyi adatok felülíródnak. Folytatja?`,
        )
      )
        return;
      const st = (await restoreBackup(b)) as State;
      store.replaceState(st);
      toast.success("Helyi mentés visszaállítva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "A visszaállítás nem sikerült.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  const field = (k: "userName" | "manufacturer" | "distributor" | "storage", l: string) => (
    <div>
      <Label>{l}</Label>
      <Input
        className="mt-1"
        value={settings[k]}
        onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
      />
    </div>
  );
  const [usage, setUsage] = useState<{ usedMB: number; persisted: boolean } | null>(null);
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    setLocal(idbAvailable());
    void storageEstimate().then(setUsage);
    void templatesStoredLocally().then(setTplLocal);
  }, []);
  const row = (k: string, v: string, ok?: boolean) => (
    <div className="flex items-center justify-between py-2 text-sm">
      <span>{k}</span>
      <span className={ok ? "font-semibold text-success" : "font-semibold"}>{v}</span>
    </div>
  );
  return (
    <div className="max-w-2xl">
      <PageHeader title="Beállítások" />
      <div className="space-y-6">
        <Panel>
          <h2 className="mb-3 font-bold uppercase tracking-wide">Üzemmód</h2>
          <ModeSwitch />
          <p className="mt-2 text-xs text-muted-foreground">OFF = Éles teszt</p>
        </Panel>
        <Panel>
          <h2 className="mb-2 font-bold uppercase tracking-wide">Adattárolás</h2>
          <div className="divide-y">
            {row("Helyi tárhely", local == null ? "…" : local ? "✓" : "Nem elérhető", !!local)}
            {row(
              "Tartós tárhely",
              usage == null ? "…" : usage.persisted ? "✓ Garantált" : "! Nem garantált",
              !!usage?.persisted,
            )}
            {row(
              "Word mestersablonok offline",
              tplLocal == null ? "…" : tplLocal ? "✓ Helyben tárolva" : "! Még nincs letöltve",
              !!tplLocal,
            )}
            {row("Internet szükséges", "Nem")}
            {row("Felhő szinkronizáció", "Kikapcsolva")}
            {row(
              "Felhasznált tárhely",
              usage
                ? `${usage.usedMB.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} MB`
                : "—",
            )}
          </div>
          {usage && !usage.persisted && (
            <p role="alert" className="mt-2 rounded-lg bg-warning-soft p-2 text-xs">
              ! A böngésző nem garantálja a tartós tárolást: az operációs rendszer vagy a böngésző
              helyhiány esetén törölheti a webhely adatait. Készítsen rendszeresen helyi biztonsági
              mentést.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Termékek, döntések, előzmények és az eredeti feltöltött fájlok ezen az eszközön
            tárolódnak, újraindítás után is megmaradnak.
          </p>
        </Panel>
        <Panel>
          <h2 className="mb-1 font-bold uppercase tracking-wide">Biztonsági mentés</h2>
          <p className="text-sm text-muted-foreground">
            Egyetlen fájl ezen az eszközön: termékek, szabályok, szótár, kategóriák, előzmények,
            eredeti forrásfájlok és sablonverziók. Nem kerül felhőbe.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="rounded-full" disabled={busy} onClick={() => void doBackup()}>
              HELYI BIZTONSÁGI MENTÉS
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              HELYI MENTÉS VISSZAÁLLÍTÁSA
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Mentésfájl kiválasztása"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doRestore(f);
              }}
            />
          </div>
        </Panel>
        <Panel className="space-y-4">
          {field("userName", "Felhasználó neve")}
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-medium">Adminisztrátori nézet</span>
              <span className="text-sm text-muted-foreground">
                Szótár, szabályok és sablonok megjelenítése a menüben.
              </span>
            </span>
            <Switch checked={admin} onCheckedChange={setAdmin} />
          </label>
        </Panel>
        <Panel className="space-y-4">
          <h2 className="font-bold">AI adatellenőrzés</h2>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              Külső AI szolgáltatás (Lovable AI). Csak rövid szövegrészletek kerülnek elküldésre,
              teljes fájlok és receptúra soha. Internet szükséges. Nélküle minden más működik.
            </span>
            <Switch
              checked={store.rawSettings.aiEnabled === true}
              disabled={!admin}
              onCheckedChange={(on) => {
                if (on && !window.confirm("Engedélyezed a külső AI szolgáltatás használatát?"))
                  return;
                store.setSettings({ ...store.rawSettings, aiEnabled: on });
              }}
            />
          </label>
          {ruleCandidates(store.rawSettings.aiMappings ?? []).length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Szabályjelöltek (jóváhagyásra várnak)</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {ruleCandidates(store.rawSettings.aiMappings ?? []).map((m) => (
                  <li key={m.pattern + m.fieldKey}>
                    „{m.pattern}” → {m.fieldKey} ({m.products.length} termék)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <Panel className="space-y-4">
          <h2 className="font-bold">Alapértelmezett szövegek</h2>
          {field("manufacturer", "Gyártó")}
          {field("distributor", "Forgalmazó")}
          {field("storage", "Tárolás")}
        </Panel>
        <Panel>
          <h2 className="font-bold">Adatok</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Minden adat csak ezen az eszközön tárolódik. Semmi nem kerül külső szolgáltatásba.
          </p>
          {store.demoMode && (
            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={() => {
                resetDemo();
                toast.success("Demó adatok visszaállítva");
              }}
            >
              Demó adatok visszaállítása
            </Button>
          )}
        </Panel>
      </div>
    </div>
  );
}
