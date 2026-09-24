import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Check, X, Lock, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { canEdit, fieldDef, type FieldDef } from "@/lib/recipe/fields";
import type { TracedValue } from "@/lib/recipe/types";
import { huDate, huNumber } from "@/lib/recipe/format";
import { cn } from "@/lib/utils";

export interface EditApi {
  get: (key: string) => TracedValue | undefined;
  set: (key: string, value: string, note: string, scope: "product" | "default") => void;
  restore: (key: string) => void;
  /** field requested by a JAVÍTÁS button: open it in edit mode once */
  focusKey?: string | null;
  clearFocus?: () => void;
}

const Ctx = createContext<EditApi | null>(null);
export const EditProvider = Ctx.Provider;

function parseNum(s: string): number | null {
  const n = Number(
    s
      .replace(/\s/g, "")
      .replace(",", ".")
      .replace(/[^0-9.-]/g, ""),
  );
  return s.trim() && Number.isFinite(n) ? n : null;
}
function fmtNum(n: number) {
  return huNumber(n, Number.isInteger(n) ? 0 : n * 10 === Math.round(n * 10) ? 1 : 2);
}

/** Read-only by default; small pencil turns only this field into an editor. */
export function InlineField({
  fieldKey,
  label,
  children,
  block,
  className,
  emptyText = "—",
}: {
  fieldKey: string;
  label?: string;
  children?: ReactNode;
  block?: boolean;
  className?: string;
  emptyText?: string;
}) {
  const api = useContext(Ctx);
  const { admin } = useStore();
  const [editing, setEditing] = useState(false);
  const v = api?.get(fieldKey);
  const def = fieldDef(fieldKey, label ?? v?.label);
  const wantFocus = !!api && api.focusKey === fieldKey && !!v && canEdit(def, admin);
  useEffect(() => {
    if (wantFocus) {
      setEditing(true);
      api?.clearFocus?.();
    }
  }, [wantFocus, api]);
  if (!api || !v) return <>{children ?? v?.display ?? emptyText}</>;
  const editable = canEdit(def, admin);
  const locked = !editable && def.kind === "regulatory";
  const shown =
    children ?? (v.display || <span className="text-muted-foreground">{emptyText}</span>);

  if (editing)
    return (
      <span data-anchor={`field:${fieldKey}`} className={block ? "block" : "inline-block"}>
        <Editor
          def={def}
          v={v}
          block={block}
          onCancel={() => setEditing(false)}
          onSave={(val, note, scope) => {
            api.set(fieldKey, val, note, scope);
            setEditing(false);
          }}
        />
      </span>
    );

  const marks = (
    <>
      {editable && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Érték módosítása"
          title="Érték módosítása"
          className="relative inline-flex shrink-0 items-center justify-center text-muted-foreground/50 transition-colors after:absolute after:-inset-3 after:content-[''] hover:text-primary focus-visible:text-primary group-hover/f:text-muted-foreground"
        >
          {def.editType === "DROPDOWN" ? (
            <span className="text-[10px] leading-none">▾</span>
          ) : (
            <Pencil className="size-3" />
          )}
        </button>
      )}
      {locked && (
        <Lock
          className="size-3 shrink-0 text-muted-foreground/60"
          aria-label="Jogszabályhoz kötött mező"
        />
      )}
      {v.origin === "manual" && v.manual && (
        <ModifiedMark v={v} onRestore={() => api.restore(fieldKey)} />
      )}
    </>
  );

  if (block)
    return (
      <div data-anchor={`field:${fieldKey}`} className={cn("group/f relative pr-14", className)}>
        <div className="absolute right-0 top-0 flex items-center gap-2">{marks}</div>
        {shown}
      </div>
    );
  return (
    <span
      data-anchor={`field:${fieldKey}`}
      className={cn("group/f inline-flex flex-wrap items-baseline gap-x-1.5", className)}
    >
      {def.editType === "DROPDOWN" && editable ? (
        <button type="button" className="text-left" onClick={() => setEditing(true)}>
          {shown}
        </button>
      ) : (
        shown
      )}
      {marks}
    </span>
  );
}

function ModifiedMark({ v, onRestore }: { v: TracedValue; onRestore: () => void }) {
  const m = v.manual!;
  return (
    <Popover>
      <PopoverTrigger
        className="relative text-[10px] font-medium text-primary/80 after:absolute after:-inset-2 after:content-[''] hover:text-primary"
        title="Manuálisan módosított érték"
      >
        Módosítva
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        <p className="mb-2 font-semibold">{v.label}</p>
        <dl className="space-y-1">
          {[
            ["Eredeti érték", m.previous || "—"],
            ["Új érték", v.display],
            ["Módosította", m.by],
            [
              "Dátum",
              `${huDate(m.at)} ${new Date(m.at).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`,
            ],
            ...(m.note ? [["Megjegyzés", m.note]] : []),
            ...(v.source
              ? [["Forrás", `${v.source.file} · ${v.source.sheet} / ${v.source.cell}`]]
              : []),
            ...(v.original != null && v.source ? [["Nyers érték", String(v.original)]] : []),
          ].map(([k, x]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="break-words font-medium">{x}</dd>
            </div>
          ))}
        </dl>
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full rounded-full"
          onClick={onRestore}
        >
          Eredeti érték visszaállítása
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function Editor({
  def,
  v,
  block,
  onSave,
  onCancel,
}: {
  def: FieldDef;
  v: TracedValue;
  block?: boolean;
  onSave: (value: string, note: string, scope: "product" | "default") => void;
  onCancel: () => void;
}) {
  const { admin, categories, addCategory } = useStore();
  const isNum = def.editType === "NUMBER" || def.editType === "PERCENTAGE";
  const unit = def.editType === "PERCENTAGE" ? "%" : def.unit;
  const initial = isNum
    ? (() => {
        const n = parseNum(v.display);
        return n == null ? "" : String(n).replace(".", ",");
      })()
    : v.display;
  const [val, setVal] = useState(initial);
  const [note, setNote] = useState("");
  const [askScope, setAskScope] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const addRef = useRef(false);
  useEffect(() => ref.current?.focus(), []);

  const finalValue = (raw: string) => {
    if (!isNum) return raw.trim();
    const n = parseNum(raw);
    if (n == null) return null;
    return def.editType === "PERCENTAGE"
      ? `${fmtNum(n)}%`
      : `${fmtNum(n)}${unit ? ` ${unit}` : ""}`;
  };
  const commit = (raw = val) => {
    const f = finalValue(raw);
    if (f == null || f === "") return;
    if (def.kind === "company" && admin) return setAskScope(f);
    onSave(f, note, "product");
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (def.editType !== "LONGTEXT" || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
  };

  const warning = def.kind === "regulatory" && (
    <p className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-xs">
      Ez jogszabályhoz kötött mező. A módosítás jogi/szakmai ellenőrzést igényel.
    </p>
  );
  const actions = (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label="Mentés"
        onClick={() => commit()}
        className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Mégse"
        onClick={onCancel}
        className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted"
      >
        <X className="size-4" />
      </button>
    </span>
  );

  if (askScope)
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2 text-sm">
        <span className="font-medium">{askScope}</span>
        <Button
          size="sm"
          className="h-7 rounded-full"
          onClick={() => onSave(askScope, note, "product")}
        >
          Csak ennél a terméknél
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full"
          onClick={() => onSave(askScope, note, "default")}
        >
          Alapérték módosítása
        </Button>
        <button
          type="button"
          aria-label="Mégse"
          onClick={onCancel}
          className="p-1 text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </span>
    );

  if (def.editType === "DROPDOWN") {
    const opts = categories[def.categoryId ?? ""]?.options ?? [];
    return (
      <span className="inline-flex flex-col gap-2">
        {warning}
        <span className="inline-flex items-center gap-1">
          <Select
            defaultOpen
            value={opts.includes(v.display) ? v.display : undefined}
            onValueChange={(x) => {
              if (x === "__add") {
                addRef.current = true;
                return setShowAdd(true);
              }
              if (x !== v.display) onSave(x, "", "product");
              else onCancel();
            }}
            onOpenChange={(o) => {
              if (!o) setTimeout(() => !addRef.current && onCancel(), 0);
            }}
          >
            <SelectTrigger className="h-9 min-w-52">
              <SelectValue placeholder="Válassz" />
            </SelectTrigger>
            <SelectContent>
              {opts.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
              {admin && (
                <>
                  <SelectSeparator />
                  <SelectItem value="__add">
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Plus className="size-3.5" /> Új kategória hozzáadása
                    </span>
                  </SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </span>
        {showAdd && (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
                if (e.key === "Enter" && adding.trim()) {
                  addCategory(def.categoryId!, adding.trim());
                  onSave(adding.trim(), "Új kategória", "product");
                }
              }}
              placeholder="Új jóváhagyott érték"
              className="h-9 rounded-md border px-2 text-sm"
            />
            <button
              type="button"
              aria-label="Mentés"
              onClick={() => {
                if (!adding.trim()) return;
                addCategory(def.categoryId!, adding.trim());
                onSave(adding.trim(), "Új kategória", "product");
              }}
              className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Mégse"
              onClick={onCancel}
              className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </span>
        )}
      </span>
    );
  }

  if (def.editType === "MULTISELECT") {
    const opts = categories[def.categoryId ?? ""]?.options ?? [];
    const sel = new Set(val.split("; ").filter(Boolean));
    return (
      <span
        className="inline-flex flex-col gap-2 rounded-xl border bg-background p-3"
        onKeyDown={keys}
      >
        <span className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sel.has(o)}
                onCheckedChange={(c) => {
                  const n = new Set(sel);
                  if (c) n.add(o);
                  else n.delete(o);
                  setVal(opts.filter((x) => n.has(x)).join("; "));
                }}
              />
              {o}
            </label>
          ))}
        </span>
        <span className="flex justify-end">{actions}</span>
      </span>
    );
  }

  if (def.editType === "BOOLEAN")
    return (
      <span className="inline-flex items-center gap-2">
        <Switch
          defaultChecked={v.display === "Igen"}
          onCheckedChange={(c) => onSave(c ? "Igen" : "Nem", "", "product")}
        />
        <button
          type="button"
          aria-label="Mégse"
          onClick={onCancel}
          className="p-1 text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </span>
    );

  if (def.editType === "LONGTEXT")
    return (
      <div className={cn("w-full", block ? "" : "inline-block")}>
        {warning}
        <textarea
          ref={ref}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={keys}
          rows={Math.max(3, Math.ceil(val.length / 80))}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
        <div className="mt-1 flex items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={keys}
            placeholder="Megjegyzés (opcionális)"
            className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
          />
          {actions}
        </div>
      </div>
    );

  return (
    <span className="inline-flex flex-col gap-1">
      {warning}
      <span className="inline-flex items-center gap-1">
        <span className="relative inline-flex items-center">
          <input
            ref={ref}
            type={def.editType === "DATE" ? "date" : "text"}
            inputMode={isNum ? "decimal" : undefined}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={keys}
            className={cn(
              "h-9 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40",
              isNum ? "w-28 pr-10 text-right" : "w-64 max-w-full",
            )}
          />
          {isNum && unit && (
            <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
        {actions}
      </span>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={keys}
        placeholder="Megjegyzés (opcionális)"
        className="h-7 w-64 max-w-full rounded-md border bg-background px-2 text-xs"
      />
    </span>
  );
}
