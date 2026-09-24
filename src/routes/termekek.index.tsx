import { DemoBadge } from "@/components/rf/ModeSwitch";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { huDate, norm } from "@/lib/recipe/format";
import { PageHeader, StatusPill, PRODUCT_STATUS } from "@/components/rf/ui";
import type { ProductStatus } from "@/lib/recipe/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/termekek/")({
  head: () => ({
    meta: [
      { title: "Termékek – PÖTTYÖS RecipeFlow" },
      {
        name: "description",
        content: "Feldolgozott termékek kereshető listája verzióval és állapottal.",
      },
      { property: "og:title", content: "Termékek – PÖTTYÖS RecipeFlow" },
      { property: "og:description", content: "Feldolgozott termékek kereshető listája." },
    ],
  }),
  component: Products,
});

function Products() {
  const { products, dictionary } = useStore();
  const [q, setQ] = useState("");
  const [f, setF] = useState<ProductStatus | "all">("all");
  const list = useMemo(() => {
    const n = norm(q);
    return products.filter((p) => {
      if (f !== "all" && p.status !== f) return false;
      if (!n) return true;
      const hay = [
        p.raw.meta.productName?.value,
        p.overrides.productName?.value,
        p.internalId,
        p.docVersion,
        ...p.ingredients.flatMap((i) => [
          i.raw.name,
          i.raw.code,
          dictionary.find((d) => d.id === i.entryId)?.packagingName,
        ]),
      ]
        .filter(Boolean)
        .map((x) => norm(String(x)))
        .join(" | ");
      return hay.includes(n);
    });
  }, [products, q, f, dictionary]);

  return (
    <div>
      <PageHeader
        title="Termékek"
        actions={
          <Button asChild className="rounded-full">
            <Link to="/uj">
              <Plus className="size-4" /> Új termék
            </Link>
          </Button>
        }
      />
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Keresés: termék, alapanyag, anyagkód, verzió"
          className="h-11 rounded-full pl-10"
        />
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {(["all", "draft", "review", "approved", "archived"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setF(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              f === s
                ? "border-primary bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            {s === "all" ? "Összes" : PRODUCT_STATUS[s]}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Nincs találat.
        </p>
      ) : (
        <div className="rounded-2xl border">
          <div className="hidden grid-cols-[2fr_1fr_1.2fr_1fr_1fr] gap-4 border-b px-4 py-2.5 text-xs font-semibold text-muted-foreground md:grid">
            <span>Termék</span>
            <span>Verzió</span>
            <span>Állapot</span>
            <span>Utolsó módosítás</span>
            <span>Felelős</span>
          </div>
          <ul className="divide-y">
            {list.map((p) => (
              <li key={p.id}>
                <Link
                  to="/termekek/$id"
                  params={{ id: p.id }}
                  className="grid gap-1 px-4 py-3.5 hover:bg-muted/60 md:grid-cols-[2fr_1fr_1.2fr_1fr_1fr] md:items-center md:gap-4"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    {p.isDemo && <DemoBadge />}
                    {String(
                      p.overrides.productName?.value ??
                        p.raw.meta.productName?.value ??
                        p.raw.fileName,
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">{p.docVersion}</span>
                  <span>
                    <StatusPill status={p.status} />
                  </span>
                  <span className="text-sm text-muted-foreground">{huDate(p.updatedAt)}</span>
                  <span className="text-sm text-muted-foreground">
                    {p.approvedBy ?? p.createdBy}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
