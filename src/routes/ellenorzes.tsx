import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { buildDataset } from "@/lib/recipe/engine";
import { LevelIcon, PageHeader } from "@/components/rf/ui";

export const Route = createFileRoute("/ellenorzes")({
  head: () => ({
    meta: [
      { title: "Ellenőrzés – PÖTTYÖS RecipeFlow" },
      { name: "description", content: "Ellenőrzésre váró és hiányos termékek egy listában." },
      { property: "og:title", content: "Ellenőrzés – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Ellenőrzésre váró és hiányos termékek." },
    ],
  }),
  component: Review,
});

function Review() {
  const { products, dictionary, settings } = useStore();
  const open = products
    .filter((p) => p.status === "draft" || p.status === "review")
    .map((p) => ({ p, ds: buildDataset(p, dictionary, settings) }));
  return (
    <div>
      <PageHeader title="Ellenőrzés" />
      {open.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Nincs ellenőrzésre váró termék.
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map(({ p, ds }) => (
            <li key={p.id}>
              <Link
                to="/termekek/$id"
                params={{ id: p.id }}
                className="flex items-center gap-4 rounded-2xl border p-4 hover:bg-muted/60"
              >
                <LevelIcon
                  level={ds.counts.error ? "error" : ds.counts.warn ? "warn" : "ok"}
                  className="size-9"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {ds.basics.productName.display || p.raw.fileName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {ds.counts.error} hiba · {ds.counts.warn} ellenőrizendő
                    {ds.checks.find((c) => c.level !== "ok") &&
                      ` · ${ds.checks.find((c) => c.level === "error")?.text ?? ds.checks.find((c) => c.level === "warn")?.text}`}
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
