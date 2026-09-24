import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { IMPORT_TEMPLATES } from "@/lib/recipe/parse";
import type { AllergenFormat } from "@/lib/recipe/engine";
import { DesktopHint, PageHeader, Panel } from "@/components/rf/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sablonok")({
  head: () => ({
    meta: [
      { title: "Sablonok – PÖTTYÖS RecipeFlow" },
      { name: "description", content: "Import- és dokumentumsablonok, allergén kiemelés beállítása." },
      { property: "og:title", content: "Sablonok – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Import- és dokumentumsablonok." },
    ],
  }),
  component: Templates,
});

const LABELS: Record<string, string> = {
  name: "Alapanyag neve",
  code: "Anyagkód",
  producer: "Gyártó",
  quantity: "Mennyiség",
  protein: "Fehérje",
  carbohydrate: "Szénhidrát",
  sugars: "Cukrok",
  fat: "Zsír",
  saturates: "Telített zsírsavak",
  salt: "Só",
  fibre: "Élelmi rost",
  totalSolids: "Szárazanyag",
  energyKj: "Energia kJ",
  energyKcal: "Energia kcal",
};

function Templates() {
  const { settings, setSettings } = useStore();
  const opts: [AllergenFormat, string, string][] = [
    ["bold-uppercase", "Félkövér + nagybetű", "SOVÁNY TÚRÓ"],
    ["bold", "Félkövér", "sovány túró"],
    ["uppercase", "Nagybetű", "SOVÁNY TÚRÓ"],
  ];
  return (
    <div>
      <PageHeader title="Sablonok" />
      <DesktopHint />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="font-bold">Dokumentumsablonok</h2>
          <ul className="mt-3 divide-y text-sm">
            {["Gyártmánylap v1", "Termékspecifikáció v1", "Csomagolási szöveg v1"].map((t) => (
              <li key={t} className="flex justify-between py-2.5">
                <span className="font-medium">{t}</span>
                <span className="text-muted-foreground">Arial · fejléc, lábléc, táblázatok</span>
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-6 font-semibold">Allergén kiemelés</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {opts.map(([k, l, ex]) => (
              <button
                key={k}
                onClick={() => setSettings({ ...settings, allergenFormat: k })}
                className={cn("rounded-xl border p-3 text-left", settings.allergenFormat === k && "border-primary bg-accent")}
              >
                <div className="text-sm font-medium">{l}</div>
                <div className={cn("mt-1 text-sm", k !== "uppercase" && "font-bold")}>{ex}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="font-bold">Importsablonok</h2>
          {IMPORT_TEMPLATES.map((t) => (
            <div key={t.id} className="mt-3">
              <p className="text-sm">
                <b>{t.name}</b> · munkalap: {t.preferredSheet}
              </p>
              <p className="mb-2 text-xs text-muted-foreground">Az oszlopokat a fejléc szövege alapján ismeri fel, nem fix cellapozíció alapján.</p>
              <ul className="divide-y text-sm">
                {Object.entries(t.columns).map(([f, al]) => (
                  <li key={f} className="flex gap-3 py-1.5">
                    <span className="w-36 shrink-0 font-medium">{LABELS[f] ?? f}</span>
                    <span className="text-muted-foreground">{al.slice(0, 4).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
