import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LevelIcon, Panel } from "@/components/rf/ui";
import { fixTarget, openIssues, STEPS, type Step } from "@/lib/recipe/fixes";
import type { Check, Product } from "@/lib/recipe/types";
import { cn } from "@/lib/utils";

/* ---------------- step counters, footer, validation task list ---------------- */

export function StepCounter({
  s,
  c,
  done,
  p,
  diffs,
  active,
}: {
  s: Step;
  c: { errors: number; warns: number };
  done: boolean;
  p: Product;
  diffs: number;
  active: boolean;
}) {
  let txt = "—";
  let tone = "text-muted-foreground";
  const n = c.errors + c.warns;
  if (s === "Jóváhagyás") {
    if (p.status === "approved") {
      txt = "✓";
      tone = "text-success";
    }
  } else if (s === "Dokumentumok") {
    if (diffs) {
      txt = String(diffs);
      tone = "text-warning";
    }
  } else if (s === "Források" && !p.files?.length) {
    txt = "—";
  } else if (n) {
    txt = s === "Források" ? "!" : String(n);
    tone = c.errors ? "text-destructive" : "text-warning";
  } else if (done) {
    txt = "✓";
    tone = "text-success";
  }
  return (
    <span
      aria-label={`${s}: ${txt}`}
      className={cn(
        "min-w-4 text-xs font-bold tabular-nums",
        active ? "text-primary-foreground" : tone,
      )}
    >
      {txt}
    </span>
  );
}

export function IssueRow({
  c,
  i,
  onFix,
  extra,
}: {
  c: Check;
  i?: number;
  onFix: (c: Check) => void;
  extra?: ReactNode;
}) {
  const t = fixTarget(c);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5">
      {i != null && <span className="w-5 text-sm font-bold text-muted-foreground">{i}.</span>}
      <LevelIcon level={c.level} />
      <span className="min-w-0 flex-1 font-medium">{c.text}</span>
      {extra}
      <Button
        size="sm"
        variant={c.level === "error" ? "default" : "outline"}
        className="rounded-full font-semibold tracking-wide"
        onClick={() => onFix(c)}
      >
        {t.label}
      </Button>
    </li>
  );
}

export function ValidationStep({
  checks,
  onFix,
  onAck,
  admin,
}: {
  checks: Check[];
  onFix: (c: Check) => void;
  onAck: (field: string) => void;
  admin: boolean;
}) {
  const open = openIssues(checks).sort((a, b) =>
    a.level === b.level ? 0 : a.level === "error" ? -1 : 1,
  );
  const ok = checks.filter((c) => c.level === "ok");
  return (
    <Panel>
      <h2 className="text-lg font-bold uppercase tracking-wide">Ellenőrzés</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        {open.length ? `${open.length} javítandó tétel` : "Nincs javítandó tétel"}
      </p>
      <ol className="space-y-2">
        {open.map((c, i) => (
          <IssueRow
            key={c.id}
            c={c}
            i={i + 1}
            onFix={onFix}
            extra={
              c.action === "regulatory" && c.field ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  disabled={!admin}
                  title={admin ? undefined : "Csak jogosult felhasználó"}
                  onClick={() => onAck(c.field!)}
                >
                  Jogi ellenőrzés megtörtént
                </Button>
              ) : null
            }
          />
        ))}
      </ol>
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer font-semibold text-success">
          ✓ {ok.length} ellenőrzés rendben
        </summary>
        <ul className="mt-2 space-y-1 pl-5 text-muted-foreground">
          {ok.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

export function StepFooter({
  step,
  blocked,
  onBack,
  onNext,
  onFix,
  onForce,
}: {
  step: Step;
  blocked: Check[] | null;
  onBack: () => void;
  onNext: () => void;
  onFix: (c: Check) => void;
  onForce: () => void;
}) {
  const i = STEPS.indexOf(step);
  return (
    <div className="mt-6">
      {blocked && blocked.length > 0 && (
        <Panel className="mb-4">
          <p className="mb-3 font-bold text-destructive" role="alert">
            {blocked.length} tételt még javítani kell
          </p>
          <ul className="space-y-2">
            {blocked.map((c) => (
              <IssueRow key={c.id} c={c} onFix={onFix} />
            ))}
          </ul>
          <button className="mt-3 text-xs text-muted-foreground underline" onClick={onForce}>
            Továbblépés javítás nélkül (a jóváhagyás zárolva marad)
          </button>
        </Panel>
      )}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          className="rounded-full px-6 font-semibold tracking-wide"
          disabled={i === 0}
          onClick={onBack}
        >
          VISSZA
        </Button>
        {i < STEPS.length - 1 && (
          <Button className="rounded-full px-6 font-semibold tracking-wide" onClick={onNext}>
            TOVÁBB
          </Button>
        )}
      </div>
    </div>
  );
}
