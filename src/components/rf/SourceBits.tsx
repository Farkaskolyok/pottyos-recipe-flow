import { cn } from "@/lib/utils";
import type { FileStatus, RegStatus } from "@/lib/recipe/sources";

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

export function RegBadge({ status }: { status: RegStatus }) {
  const m = {
    ok: ["✓", "Ellenőrzött", "bg-success-soft text-success"],
    review: ["!", "Ellenőrzendő", "bg-warning-soft text-foreground"],
    invalid: ["×", "Nem használható", "bg-danger-soft text-destructive"],
  }[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", m[2])}>
      {m[0]} {m[1]}
    </span>
  );
}
