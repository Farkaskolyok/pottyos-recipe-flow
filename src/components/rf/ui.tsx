import type { ReactNode } from "react";
import { Check as CheckIcon, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckLevel, MatchStatus, Origin, ProductStatus } from "@/lib/recipe/types";

export const PRODUCT_STATUS: Record<ProductStatus, string> = {
  draft: "Vázlat",
  processing: "Feldolgozás",
  review: "Ellenőrzés alatt",
  approved: "Jóváhagyva",
  archived: "Archivált",
};

export function StatusPill({ status }: { status: ProductStatus }) {
  const cls = {
    draft: "bg-muted text-muted-foreground",
    processing: "bg-muted text-foreground",
    review: "bg-warning-soft text-foreground",
    approved: "bg-success-soft text-success",
    archived: "bg-secondary text-muted-foreground",
  }[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {PRODUCT_STATUS[status]}
    </span>
  );
}

export function LevelIcon({ level, className }: { level: CheckLevel; className?: string }) {
  const map = {
    ok: { I: CheckIcon, c: "bg-success-soft text-success" },
    warn: { I: AlertTriangle, c: "bg-warning-soft text-warning" },
    error: { I: X, c: "bg-danger-soft text-destructive" },
  }[level];
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
        map.c,
        className,
      )}
    >
      <map.I className="size-4" strokeWidth={2.5} />
    </span>
  );
}

export function MatchPill({ status }: { status: MatchStatus }) {
  const m = {
    recognized: ["Felismert", "bg-success-soft text-success"],
    review: ["Ellenőrizendő", "bg-warning-soft text-foreground"],
    unknown: ["Ismeretlen", "bg-danger-soft text-destructive"],
  }[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", m[1])}>
      {m[0]}
    </span>
  );
}

export function OriginTag({ origin }: { origin: Origin }) {
  const m = {
    source: "Forrás",
    calculated: "Számított",
    manual: "Manuális",
    company: "Céges fix",
    regulatory: "Jogszabályi",
  }[origin];
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-1.5 py-px text-[11px] font-medium",
        origin === "manual"
          ? "border-primary/40 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      {m}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]", className)}>
      {children}
    </div>
  );
}

export function DesktopHint() {
  return (
    <p className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground lg:hidden">
      Ez a funkció asztali nézetben használható a legkényelmesebben.
    </p>
  );
}
