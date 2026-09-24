import { cn } from "@/lib/utils";
import { REG_LABELS, regStatus, type FileStatus, type RegStatus } from "@/lib/recipe/sources";

export function FileStatusBadge({ status, label }: { status: FileStatus; label?: string }) {
  const m = {
    ok: ["✓", "Feldolgozva", "text-success"],
    review: ["!", "Ellenőrzendő", "text-warning"],
    unreadable: ["×", "Nem olvasható", "text-destructive"],
  }[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-semibold", m[2])}>
      <span aria-hidden>{m[0]}</span> {label ?? m[1]}
    </span>
  );
}

export function RegBadge({ status }: { status: RegStatus | string }) {
  const st = regStatus({ status });
  const m = {
    unverified: ["!", "bg-warning-soft text-foreground"],
    verified_local: ["✓", "bg-success-soft text-success"],
    verified_online: ["✓", "bg-success-soft text-success"],
    not_found: ["×", "bg-danger-soft text-destructive"],
    invalid: ["×", "bg-danger-soft text-destructive"],
  }[st];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", m[1])}>
      {m[0]} {REG_LABELS[st]}
    </span>
  );
}
