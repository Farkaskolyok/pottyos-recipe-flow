import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { IMPORT_TEMPLATES } from "@/lib/recipe/parse";
import { DOC_TITLES, FIELD_CLASS_LABELS, TEMPLATE_MAPS } from "@/lib/recipe/documents";
import type { AllergenFormat } from "@/lib/recipe/engine";
import { DesktopHint, PageHeader, Panel } from "@/components/rf/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sablonok")({
  head: () => ({
    meta: [
      { title: "Sablonok – PÖTTYÖS RecipeFlow" },
      {
        name: "description",
        content: "Import- és dokumentumsablonok, allergén kiemelés beállítása.",
      },
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
          <p className="mt-1 text-xs text-muted-foreground">
            A korábbi dokumentumok csak a szerkezetet adják. Az értékek mindig az aktuális
            termékadatokból jönnek.
          </p>
          {(Object.keys(TEMPLATE_MAPS) as (keyof typeof TEMPLATE_MAPS)[]).map((k) => (
            <details key={k} className="mt-3 rounded-xl border px-3 py-2">
              <summary className="cursor-pointer font-medium">
                {DOC_TITLES[k]} master{" "}
                <span className="text-xs text-muted-foreground">
                  · {TEMPLATE_MAPS[k].filter(([, c]) => c === "UNCERTAIN").length} ellenőrizendő
                  mezőtípus
                </span>
              </summary>
              <ul className="mt-2 divide-y text-sm">
                {TEMPLATE_MAPS[k].map(([f, c]) => (
                  <li key={f} className="flex justify-between gap-3 py-1.5">
                    <span>{f}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        c === "UNCERTAIN" ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {c === "UNCERTAIN" ? "! " : ""}
                      {FIELD_CLASS_LABELS[c]}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <h3 className="mb-2 mt-6 font-semibold">Allergén kiemelés</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {opts.map(([k, l, ex]) => (
              <button
                key={k}
                onClick={() => setSettings({ ...settings, allergenFormat: k })}
                className={cn(
                  "rounded-xl border p-3 text-left",
                  settings.allergenFormat === k && "border-primary bg-accent",
                )}
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
              <p className="mb-2 text-xs text-muted-foreground">
                Az oszlopokat a fejléc szövege alapján ismeri fel, nem fix cellapozíció alapján.
              </p>
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
