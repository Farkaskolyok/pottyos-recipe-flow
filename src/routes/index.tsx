import { DemoBadge, ModeSwitch } from "@/components/rf/ModeSwitch";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { buildDataset } from "@/lib/recipe/engine";
import { huDate } from "@/lib/recipe/format";
import { StatusPill } from "@/components/rf/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PÖTTYÖS RecipeFlow – Főoldal" },
      {
        name: "description",
        content: "Gyártmánylap, termékspecifikáció és csomagolási szöveg egy receptből.",
      },
      { property: "og:title", content: "PÖTTYÖS RecipeFlow" },
      {
        property: "og:description",
        content: "Egy recept. Egy ellenőrzött adatforrás. Minden szükséges dokumentum.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { products, dictionary, settings, ready } = useStore();
  const stats = useMemo(() => {
    const s = { draft: 0, review: 0, approved: 0, error: 0 };
    for (const p of products) {
      if (p.status === "approved") s.approved++;
      else if (buildDataset(p, dictionary, settings).counts.error) s.error++;
      else if (p.status === "review") s.review++;
      else s.draft++;
    }
    return s;
  }, [products, dictionary, settings]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ModeSwitch />
      </div>
      <section className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          <span className="text-primary">PÖTTYÖS</span> RecipeFlow
        </h1>
      </section>

      <section className="mb-10 flex flex-col items-start gap-6 rounded-3xl bg-accent p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <h2 className="text-xl font-bold">Új termék</h2>
        <Button asChild size="lg" className="h-12 rounded-full px-6 text-base">
          <Link to="/uj">
            <Plus className="size-5" /> Új termék feldolgozása
          </Link>
        </Button>
      </section>

      <section className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Feldolgozás alatt", stats.draft, "text-foreground"],
          ["Ellenőrzésre vár", stats.review, "text-warning"],
          ["Jóváhagyva", stats.approved, "text-success"],
          ["Hibás / hiányos", stats.error, "text-destructive"],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-2xl border p-4">
            <div className={`text-3xl font-bold ${c}`}>{ready ? v : "–"}</div>
            <div className="mt-1 text-sm text-muted-foreground">{l}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Legutóbbi termékek</h2>
        {ready && products.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="text-muted-foreground">Még nincs feldolgozott termék.</p>
            <Button asChild className="mt-4 rounded-full">
              <Link to="/uj">
                <Plus className="size-4" /> Új termék
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {products.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link
                  to="/termekek/$id"
                  params={{ id: p.id }}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate font-semibold">
                      {p.isDemo && <DemoBadge />}
                      {String(
                        p.overrides.productName?.value ??
                          p.raw.meta.productName?.value ??
                          p.raw.fileName,
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {p.docVersion} · {huDate(p.updatedAt)}
                    </div>
                  </div>
                  <StatusPill status={p.status} />
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
