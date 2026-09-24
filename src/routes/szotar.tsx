import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { norm } from "@/lib/recipe/format";
import { DesktopHint, PageHeader } from "@/components/rf/ui";

export const Route = createFileRoute("/szotar")({
  head: () => ({
    meta: [
      { title: "Alapanyag szótár – PÖTTYÖS RecipeFlow" },
      {
        name: "description",
        content: "Technikai alapanyagnevek, aliasok és jóváhagyott csomagolási megnevezések.",
      },
      { property: "og:title", content: "Alapanyag szótár – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Jóváhagyott alapanyag terminológia." },
    ],
  }),
  component: Dictionary,
});

function Dictionary() {
  const { dictionary } = useStore();
  const [q, setQ] = useState("");
  const n = norm(q);
  const list = dictionary.filter(
    (d) =>
      !n ||
      norm([d.technicalName, d.packagingName, d.materialCode, ...d.aliases].join(" ")).includes(n),
  );
  return (
    <div>
      <PageHeader title="Alapanyag szótár" />
      <DesktopHint />
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Keresés név, alias vagy anyagkód szerint"
          className="h-11 rounded-full pl-10"
        />
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((d) => (
          <li key={d.id} className="rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{d.technicalName}</div>
                <div className="text-sm">
                  Csomagoláson: <b>{d.packagingName}</b>
                </div>
              </div>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                {d.materialCode ?? "—"}
              </span>
            </div>
            {d.aliases.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {d.aliases.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {d.group && <span>Csoport: {d.group}</span>}
              {d.allergen && (
                <span className="font-semibold text-primary">Allergén: {d.allergen}</span>
              )}
              <span>Százalék: {d.showPercentage ? "igen" : "nem"}</span>
              {d.subIngredients && <span>Összetevői: {d.subIngredients}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
