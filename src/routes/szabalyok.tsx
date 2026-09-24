import { createFileRoute } from "@tanstack/react-router";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/lib/store";
import { VISIBILITY_LABELS, type Destination } from "@/lib/recipe/engine";
import { DesktopHint, PageHeader, Panel } from "@/components/rf/ui";

export const Route = createFileRoute("/szabalyok")({
  head: () => ({
    meta: [
      { title: "Szabályok – PÖTTYÖS RecipeFlow" },
      {
        name: "description",
        content:
          "Kerekítési, tápérték- és összetevő-szabályok, mezők láthatósága dokumentumonként.",
      },
      { property: "og:title", content: "Szabályok – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Determinisztikus feldolgozási szabályok." },
    ],
  }),
  component: Rules,
});

const DEST: [Destination, string][] = [
  ["sheet", "Gyártmánylap"],
  ["spec", "Termékspecifikáció"],
  ["pack", "Csomagolás"],
];

function Rules() {
  const { rules, setRules, settings, setSettings } = useStore();
  const cats = [...new Set(rules.map((r) => r.category))];
  return (
    <div>
      <PageHeader
        title="Szabályok"
        subtitle="Minden érték ezekkel a rögzített szabályokkal készül – nincs találgatás."
      />
      <DesktopHint />
      <div className="space-y-6">
        {cats.map((c) => (
          <Panel key={c}>
            <h2 className="mb-3 font-bold">{c}</h2>
            <ul className="divide-y">
              {rules
                .filter((r) => r.category === c)
                .map((r) => (
                  <li key={r.id} className="flex items-start gap-4 py-3">
                    <div className="flex-1">
                      <div className="font-semibold">
                        {r.name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {r.version} · {r.scope} · prioritás {r.priority}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{r.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Bemenet: {r.input} · Feltétel: {r.condition} · Kimenet: {r.output}
                      </p>
                    </div>
                    <Switch
                      checked={r.active}
                      disabled
                      title="A kerekítési szabályok a demóban nem kapcsolhatók ki"
                      onCheckedChange={(v) =>
                        setRules(rules.map((x) => (x.id === r.id ? { ...x, active: v } : x)))
                      }
                    />
                  </li>
                ))}
            </ul>
          </Panel>
        ))}

        <Panel>
          <h2 className="mb-1 font-bold">Mezők megjelenése</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Melyik adat melyik dokumentumba kerüljön.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-semibold">Mező</th>
                  {DEST.map(([, l]) => (
                    <th key={l} className="px-2 py-2 text-center font-semibold">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(VISIBILITY_LABELS).map(([k, l]) => (
                  <tr key={k}>
                    <td className="py-2.5">{l}</td>
                    {DEST.map(([d]) => {
                      const on = (settings.visibility[k] ?? []).includes(d);
                      return (
                        <td key={d} className="px-2 text-center">
                          <Checkbox
                            checked={on}
                            onCheckedChange={(v) => {
                              const cur = settings.visibility[k] ?? [];
                              setSettings({
                                ...settings,
                                visibility: {
                                  ...settings.visibility,
                                  [k]: v ? [...cur, d] : cur.filter((x) => x !== d),
                                },
                              });
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
