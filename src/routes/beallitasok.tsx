import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { idbAvailable, storageEstimate } from "@/lib/idb";
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
  const { settings, setSettings, admin, setAdmin, resetDemo } = useStore();
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
          <h2 className="mb-2 font-bold uppercase tracking-wide">Adattárolás</h2>
          <div className="divide-y">
            {row("Helyi tárhely", local == null ? "…" : local ? "✓" : "Nem elérhető", !!local)}
            {row("Internet szükséges", "Nem")}
            {row("Felhő szinkronizáció", "Kikapcsolva")}
            {row(
              "Felhasznált tárhely",
              usage
                ? `${usage.usedMB.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} MB`
                : "—",
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Termékek, döntések, előzmények és az eredeti feltöltött fájlok ezen az eszközön
            tárolódnak, újraindítás után is megmaradnak.
          </p>
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
        </Panel>
      </div>
    </div>
  );
}
