import { useMemo, useState, type ReactNode } from "react";
import { FileText, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LevelIcon, Panel } from "@/components/rf/ui";
import { FileStatusBadge, RegBadge } from "@/components/rf/SourceBits";
import type { CheckLevel, Product, TracedValue } from "@/lib/recipe/types";
import {
  openSource,
  findConflicts,
  SOURCE_TYPE_LABELS,
  type ExtractedField,
  regBad,
  regStatus,
  regVerified,
  verifyRegulationOnline,
  type RegRef,
  type SourceFile,
  type SourceType,
} from "@/lib/recipe/sources";
import { huNumber } from "@/lib/recipe/format";
import { cn } from "@/lib/utils";

interface Props {
  p: Product;
  admin: boolean;
  user: string;
  companyFixed: { label: string; value: string }[];
  onChange: (next: Product, note: string) => void;
  onTrace: (key: string, v: TracedValue) => void;
  onNext: () => void;
}

export function fieldTrace(f: SourceFile, x: ExtractedField): TracedValue {
  const display = `${x.value}${x.unit ? " " + x.unit : ""}${x.tolerance ? " " + x.tolerance : ""}`;
  return {
    label: x.label,
    original: x.original,
    calculated: x.num ?? x.value,
    display,
    origin: "source",
    source: {
      file: f.name,
      sheet: x.sheet ?? "—",
      cell: x.cell ?? "—",
      page: x.page,
      sourceType: SOURCE_TYPE_LABELS[f.sourceType],
      fileId: f.id,
    },
    rule: x.method ? `Módszer: ${x.method}` : "Dokumentumból felismerve",
  };
}

const worst = (l: CheckLevel[]): CheckLevel =>
  l.includes("error") ? "error" : l.includes("warn") ? "warn" : "ok";

export function SourcesStep({ p, admin, user, companyFixed, onChange, onTrace, onNext }: Props) {
  const files = p.files ?? [];
  const [openFile, setOpenFile] = useState<SourceFile | null>(null);
  const [ingRow, setIngRow] = useState<number | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const conflicts = useMemo(() => findConflicts(p), [p]);
  const dec = p.conflictDecisions ?? {};
  const now = () => new Date().toISOString();
  const audit = (text: string) => [...(p.audit ?? []), { at: now(), by: user, text }];
  const setFile = (id: string, patch: Partial<SourceFile>, note: string) =>
    onChange(
      { ...p, files: files.map((f) => (f.id === id ? { ...f, ...patch } : f)), audit: audit(note) },
      note,
    );
  const ingName = (row?: number) => p.ingredients.find((i) => i.raw.row === row)?.raw.name ?? "—";

  const specs = files.filter((f) => f.sourceType !== "HISTORICAL_REFERENCE");
  const suggested = files.filter((f) => f.linkState === "suggested");
  const unknown = files.flatMap((f) => f.unknown.map((u) => ({ f, u })));
  const regs = files.flatMap((f) => f.regulatory.map((r) => ({ f, r })));
  const quality = files.flatMap((f) =>
    f.fields.filter((x) => x.key.startsWith("q.")).map((x) => ({ f, x })),
  );
  const storage = files.flatMap((f) =>
    f.fields
      .filter((x) => ["storage_conditions", "transport_conditions", "shelf_life"].includes(x.key))
      .map((x) => ({ f, x })),
  );
  const allergens = files.flatMap((f) =>
    f.fields.filter((x) => x.key === "allergens").map((x) => ({ f, x })),
  );
  const packaging = files.flatMap((f) =>
    f.fields.filter((x) => /packaging/.test(x.key)).map((x) => ({ f, x })),
  );
  const openConf = conflicts.filter((c) => !dec[c.id]);
  // one verification status per normalized identifier, shared by every source document
  const regGroups = [...new Set(regs.map(({ r }) => r.identifier))].map((id) => {
    const items = regs.filter(({ r }) => r.identifier === id);
    const best =
      items.find(({ r }) => regVerified(r)) ??
      items.find(({ r }) => regBad(r)) ??
      items[0]!;
    return { id, r: best.r, items };
  });
  const [checking, setChecking] = useState<string | null>(null);
  const setReg = (identifier: string, patch: Partial<RegRef>, note: string) =>
    onChange(
      {
        ...p,
        files: files.map((f) => ({
          ...f,
          regulatory: f.regulatory.map((x) =>
            x.identifier === identifier ? { ...x, ...patch } : x,
          ),
        })),
        audit: audit(note),
      },
      note,
    );
  const markManual = (identifier: string) =>
    setReg(
      identifier,
      {
        status: "verified_local",
        reviewedAt: now(),
        reviewedBy: user,
        verificationMethod: "manual",
        verificationSource: undefined,
        sourceUrl: undefined,
      },
      `Jogszabályi hivatkozás kézzel ellenőrzöttnek jelölve: ${identifier}`,
    );
  const checkOnline = async (identifier: string) => {
    setChecking(identifier);
    const res = await verifyRegulationOnline(identifier);
    setChecking(null);
    if (res.kind === "offline") {
      toast.error("Online ellenőrzés nem elérhető");
      return;
    }
    const base = {
      reviewedAt: now(),
      reviewedBy: user,
      verificationMethod: "online" as const,
    };
    if (res.kind === "found") {
      setReg(
        identifier,
        { ...base, status: "verified_online", verificationSource: res.source, sourceUrl: res.url },
        `Online ellenőrzés: ${identifier} → megtalálva (${res.source})`,
      );
      toast.success(`${identifier}: Online ellenőrzött`);
    } else if (res.kind === "not_found") {
      setReg(
        identifier,
        { ...base, status: "not_found", verificationSource: res.source, sourceUrl: undefined },
        `Online ellenőrzés: ${identifier} → nem található`,
      );
      toast.error(`${identifier}: Nem található`);
    } else {
      setReg(identifier, { ...base, status: "invalid" }, `Online ellenőrzés: ${identifier} → hibás`);
      toast.error(`${identifier}: Hibás hivatkozás`);
    }
  };

  const lv = {
    files: worst(files.map((f) => (f.status === "ok" ? "ok" : "warn"))),
    links: suggested.length ? "warn" : "ok",
    conf: openConf.length ? "error" : "ok",
    unk: unknown.some(({ u }) => !u.decision) ? "warn" : "ok",
    quality: quality.some(({ x }) => x.suspect) ? "warn" : "ok",
    reg: regs.some(({ r }) => regBad(r))
      ? "error"
      : regs.some(({ r }) => regStatus(r) === "unverified")
        ? "warn"
        : "ok",
  } as Record<string, CheckLevel>;
  const allOk = Object.values(lv).every((l) => l === "ok");

  const summary: [string, ReactNode][] = [
    [
      "Recept",
      <LevelIcon key="r" level={p.ingredients.length ? "ok" : "error"} className="size-6" />,
    ],
    [
      `${specs.length} alapanyag specifikáció`,
      <LevelIcon key="s" level={lv.files} className="size-6" />,
    ],
    ["Alapanyag-kapcsolatok", <LevelIcon key="l" level={lv.links} className="size-6" />],
    ["Minőségi paraméterek", <LevelIcon key="q" level={lv.quality} className="size-6" />],
    ["Jogszabályok", <LevelIcon key="j" level={lv.reg} className="size-6" />],
    ["Céges fix adatok", <LevelIcon key="c" level="ok" className="size-6" />],
    [
      "Nem besorolt adatok",
      <span key="u" className="font-bold">
        {unknown.filter(({ u }) => !u.decision).length}
      </span>,
    ],
    [
      "Ütköző értékek",
      <span key="k" className={cn("font-bold", openConf.length && "text-destructive")}>
        {openConf.length}
      </span>,
    ],
  ];

  return (
    <div className="space-y-5">
      <Panel>
        <h2 className="mb-4 text-lg font-bold">Ellenőrzési összefoglaló</h2>
        <ul className="divide-y">
          {summary.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between py-2 text-sm">
              <span>{k}</span>
              {v}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button className="rounded-full px-6" onClick={onNext}>
            {allOk ? "DOKUMENTUMOK ELKÉSZÍTÉSE" : "ELLENŐRZÉS FOLYTATÁSA"}
          </Button>
        </div>
      </Panel>

      <Block title="Dokumentumok" level={lv.files}>
        <ul className="space-y-2">
          <li className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
            <FileText className="size-4 text-success" />
            <span className="min-w-0 flex-1 truncate font-medium">{p.raw.fileName}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">Receptúra</span>
            <FileStatusBadge status="ok" />
            <OpenBtn id={`recipe:${p.id}`} />
          </li>
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <button
                onClick={() => setOpenFile(f)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm hover:bg-muted/60"
              >
                <FileText className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {SOURCE_TYPE_LABELS[f.sourceType]}
                </span>
                <FileStatusBadge status={f.status} />
              </button>
              <OpenBtn id={f.id} />
              {f.ext === "doc" &&
                f.status !== "ok" &&
                (p.partialReviewAck?.[f.id] ? (
                  <span className="text-xs font-semibold text-success">✓ Kézzel ellenőrizve</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={!admin}
                    title={admin ? undefined : "Csak jogosult felhasználó"}
                    onClick={() => {
                      const note = `Részlegesen olvasott dokumentum kézzel ellenőrizve: ${f.name}`;
                      onChange(
                        {
                          ...p,
                          partialReviewAck: {
                            ...(p.partialReviewAck ?? {}),
                            [f.id]: { by: user, at: now() },
                          },
                          audit: audit(note),
                        },
                        note,
                      );
                    }}
                  >
                    Kézi ellenőrzés megtörtént
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      </Block>

      {suggested.length > 0 && (
        <Block title="Alapanyagok összekapcsolása" level="warn">
          <ul className="space-y-3">
            {suggested.map((f) => (
              <li key={f.id} className="rounded-xl border p-3 text-sm">
                <p className="font-medium">{f.name}</p>
                <p className="mt-1 text-muted-foreground">
                  Ez a dokumentum valószínűleg ehhez az alapanyaghoz tartozik:
                </p>
                <p className="mt-1 font-semibold">{ingName(f.linkRow)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      setFile(
                        f.id,
                        { linkState: "linked" },
                        `Összekapcsolva: ${f.name} → ${ingName(f.linkRow)}`,
                      )
                    }
                  >
                    Összekapcsolás
                  </Button>
                  <Select
                    onValueChange={(v) =>
                      setFile(
                        f.id,
                        { linkState: "linked", linkRow: Number(v) },
                        `Összekapcsolva: ${f.name} → ${ingName(Number(v))}`,
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-auto rounded-full text-xs">
                      <SelectValue placeholder="Másik alapanyag kiválasztása" />
                    </SelectTrigger>
                    <SelectContent>
                      {p.ingredients.map((i) => (
                        <SelectItem key={i.raw.row} value={String(i.raw.row)}>
                          {i.raw.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() =>
                      setFile(
                        f.id,
                        { linkState: "rejected", linkRow: undefined },
                        `Nem kapcsolódik: ${f.name}`,
                      )
                    }
                  >
                    Nem kapcsolódik
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Alapanyagok – forrás mátrix" level={lv.links}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Alapanyag</th>
                <th className="pr-3 font-medium">Recept</th>
                <th className="pr-3 font-medium">Specifikáció</th>
                <th className="font-medium">Állapot</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {p.ingredients.map((i) => {
                const linked = files.filter(
                  (f) => f.linkRow === i.raw.row && f.linkState === "linked",
                );
                const sug = files.some(
                  (f) => f.linkRow === i.raw.row && f.linkState === "suggested",
                );
                const conf = openConf.some((c) => c.row === i.raw.row);
                const level: CheckLevel = conf ? "error" : sug || !linked.length ? "warn" : "ok";
                return (
                  <tr
                    key={i.raw.row}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setIngRow(i.raw.row)}
                  >
                    <td className="py-2 pr-3 font-medium">{i.raw.name}</td>
                    <td className="max-w-[10rem] truncate pr-3 text-muted-foreground">
                      {p.raw.fileName}
                    </td>
                    <td className="max-w-[14rem] truncate pr-3 text-muted-foreground">
                      {linked.map((f) => f.name).join(", ") ||
                        (sug ? "javaslat vár döntésre" : "—")}
                    </td>
                    <td>
                      <LevelIcon level={level} className="size-6" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Block>

      {conflicts.length > 0 && (
        <Block title="Eltérő adatok" level={lv.conf}>
          <ul className="space-y-3">
            {conflicts.map((c) => {
              const d = dec[c.id];
              const choose = (choice: "recipe" | "spec" | "manual", value: number) =>
                onChange(
                  {
                    ...p,
                    conflictDecisions: { ...dec, [c.id]: { choice, value, by: user, at: now() } },
                    audit: audit(
                      `Ütközés feloldva (${c.ingredient} – ${c.label}): ${choice === "recipe" ? "recept" : choice === "spec" ? "specifikáció" : "kézi érték"} ${value}`,
                    ),
                  },
                  `Ütközés feloldva: ${c.ingredient} – ${c.label}`,
                );
              return (
                <li key={c.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-semibold">
                    {c.label}{" "}
                    <span className="font-normal text-muted-foreground">· {c.ingredient}</span>
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-xs text-muted-foreground">
                        Recept ({c.recipeCell ?? "—"})
                      </p>
                      <p className="font-bold">{huNumber(c.recipe, 2)} g</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <p className="text-xs text-muted-foreground">
                        Beszállítói specifikáció{c.field.page ? ` (${c.field.page}. oldal)` : ""}
                      </p>
                      <p className="font-bold">{huNumber(c.spec, 2)} g</p>
                    </div>
                  </div>
                  {d ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Döntés:{" "}
                      {d.choice === "recipe"
                        ? "Recept"
                        : d.choice === "spec"
                          ? "Specifikáció"
                          : "Kézi érték"}{" "}
                      ({huNumber(d.value, 2)} g) · {d.by}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => choose("recipe", c.recipe)}
                      >
                        Recept használata
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => choose("spec", c.spec)}
                      >
                        Specifikáció használata
                      </Button>
                      <Input
                        className="h-8 w-24"
                        placeholder="érték"
                        value={manual[c.id] ?? ""}
                        onChange={(e) => setManual({ ...manual, [c.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        disabled={
                          !Number.isFinite(Number((manual[c.id] ?? "").replace(",", "."))) ||
                          !manual[c.id]
                        }
                        onClick={() => choose("manual", Number(manual[c.id].replace(",", ".")))}
                      >
                        Kézi érték megadása
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {unknown.length > 0 && (
        <Block title="Új / nem besorolt adat" level={lv.unk}>
          <ul className="space-y-3">
            {unknown.map(({ f, u }) => {
              const act = (action: "field" | "newField" | "note" | "ignore", label: string) =>
                setFile(
                  f.id,
                  {
                    unknown: f.unknown.map((x) =>
                      x.id === u.id ? { ...x, decision: { action, by: user, at: now() } } : x,
                    ),
                  },
                  `Nem besorolt adat: ${label}`,
                );
              return (
                <li key={u.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">“{u.text}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.name}
                    {u.page ? ` · ${u.page}. oldal` : ""} · Dokumentumból felismerve
                  </p>
                  {u.decision ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {
                        {
                          field: "Meglévő mezőhöz besorolva",
                          newField: "Új mezőtípusként rögzítve",
                          note: "Belső megjegyzésként megtartva",
                          ignore: "Figyelmen kívül hagyva",
                        }[u.decision.action]
                      }{" "}
                      · {u.decision.by}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => act("field", "besorolás meglévő mezőhöz")}
                      >
                        Besorolás meglévő mezőhöz
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={!admin}
                        onClick={() => act("newField", "új mezőtípus")}
                      >
                        Új mezőtípus létrehozása
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => act("note", "belső megjegyzés")}
                      >
                        Belső megjegyzésként megtartás
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        disabled={!admin}
                        title={admin ? undefined : "Csak jogosult felhasználó"}
                        onClick={() => act("ignore", "figyelmen kívül hagyva")}
                      >
                        Figyelmen kívül hagyás
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      <Block title="Minőségi paraméterek" level={lv.quality}>
        {quality.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Paraméter</th>
                  <th className="pr-3 font-medium">Érték</th>
                  <th className="pr-3 font-medium">Tűrés</th>
                  <th className="pr-3 font-medium">Módszer</th>
                  <th className="font-medium">Forrás</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quality.map(({ f, x }, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onTrace(x.key, fieldTrace(f, x))}
                  >
                    <td className="py-2 pr-3 font-medium">{x.label}</td>
                    <td className="pr-3">
                      {x.value} {x.unit}
                      {x.suspect && (
                        <span className="block text-xs font-semibold text-warning">
                          ! {x.suspect}
                        </span>
                      )}
                    </td>
                    <td className="pr-3">{x.tolerance ?? "—"}</td>
                    <td className="pr-3 text-muted-foreground">{x.method ?? "—"}</td>
                    <td className="max-w-[12rem] truncate text-xs text-muted-foreground">
                      {ingName(f.linkRow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nincs minőségi paraméter a specifikációkban.
          </p>
        )}
      </Block>

      <FieldBlock title="Allergének" items={allergens} onTrace={onTrace} ingName={ingName} />
      <FieldBlock title="Tárolás / szállítás" items={storage} onTrace={onTrace} ingName={ingName} />
      <FieldBlock
        title="Csomagolás"
        items={packaging}
        onTrace={onTrace}
        ingName={ingName}
        empty="A specifikációk nem tartalmaznak csomagolási adatot."
      />

      <Block title="Céges fix adatok" level="ok">
        <ul className="divide-y text-sm">
          {companyFixed.map((c) => (
            <li key={c.label} className="flex justify-between gap-3 py-2">
              <span className="text-muted-foreground">{c.label}</span>
              <span className="font-medium">{c.value}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Jogszabályi ellenőrzés" level={lv.reg}>
        {regGroups.length ? (
          <ul className="space-y-2">
            {regGroups.map(({ id, r, items }) => {
              const done = regVerified(r);
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm"
                >
                  <span className="w-32 font-semibold">{id}</span>
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {items.map(({ f, r: x }) => (
                      <span key={x.id} className="block truncate" title={x.original}>
                        {f.name}
                        {x.page ? ` · ${x.page}. oldal` : ""}
                      </span>
                    ))}
                    {r.reviewedAt && r.verificationMethod !== "library" && (
                      <span className="block">
                        {r.verificationMethod === "online" ? "Online" : "Kézi"} ·{" "}
                        {r.reviewedBy} · {new Date(r.reviewedAt).toLocaleString("hu-HU")}
                        {r.sourceUrl && (
                          <>
                            {" · "}
                            <a
                              href={r.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {r.verificationSource ?? "Forrás"}
                            </a>
                          </>
                        )}
                      </span>
                    )}
                  </span>
                  <RegBadge status={r.status} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full text-xs font-semibold"
                      disabled={checking === id}
                      onClick={() => void checkOnline(id)}
                    >
                      {checking === id
                        ? "…"
                        : done
                          ? "ÚJRA ELLENŐRZÉS"
                          : "ONLINE ELLENŐRZÉS"}
                    </Button>
                    {done ? (
                      <span className="self-center text-xs font-bold text-success">ELLENŐRZÖTT</span>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 rounded-full text-xs font-semibold"
                        onClick={() => markManual(id)}
                      >
                        ELLENŐRZÖTTNEK JELÖLÖM
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nincs jogszabályi hivatkozás a dokumentumokban.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Online ellenőrzéskor csak a jogszabály azonosítója kerül elküldésre (EUR-Lex), semmilyen
          termék- vagy dokumentumadat nem.
        </p>
      </Block>

      {(p.audit?.length ?? 0) > 0 && (
        <Panel>
          <h2 className="mb-3 font-bold">Döntési napló</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {[...(p.audit ?? [])]
              .reverse()
              .slice(0, 12)
              .map((a, i) => (
                <li key={i}>
                  {new Date(a.at).toLocaleString("hu-HU")} · {a.by} · {a.text}
                </li>
              ))}
          </ul>
        </Panel>
      )}

      <Dialog open={!!openFile} onOpenChange={(o) => !o && setOpenFile(null)}>
        <DialogContent>
          {openFile &&
            (() => {
              const f = files.find((x) => x.id === openFile.id) ?? openFile;
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="break-all pr-6">{f.name}</DialogTitle>
                  </DialogHeader>
                  <dl className="divide-y rounded-xl border text-sm">
                    <Row k="Dokumentum típusa">
                      <Select
                        value={f.sourceType}
                        onValueChange={(v) =>
                          setFile(
                            f.id,
                            { sourceType: v as SourceType },
                            `Forrástípus módosítva: ${f.name}`,
                          )
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SOURCE_TYPE_LABELS) as SourceType[])
                            .filter((t) => t !== "RECIPE")
                            .map((t) => (
                              <SelectItem key={t} value={t}>
                                {SOURCE_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </Row>
                    <Row k="Azonosított anyag">{f.detectedMaterial ?? "—"}</Row>
                    <Row k="Kapcsolt alapanyag">
                      {f.linkState === "linked"
                        ? ingName(f.linkRow)
                        : f.linkState === "suggested"
                          ? `javaslat: ${ingName(f.linkRow)}`
                          : "—"}
                    </Row>
                    <Row k="Kinyert mezők">{f.fields.length}</Row>
                    <Row k="Jogszabályi hivatkozás">{f.regulatory.length}</Row>
                    <Row k="Állapot">
                      <FileStatusBadge status={f.status} />
                    </Row>
                  </dl>
                  {f.warnings.length > 0 && (
                    <ul className="rounded-xl bg-warning-soft p-3 text-sm">
                      {f.warnings.map((w) => (
                        <li key={w}>! {w}</li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

      <Sheet open={ingRow != null} onOpenChange={(o) => !o && setIngRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {ingRow != null && (
            <>
              <SheetHeader>
                <SheetTitle className="uppercase">{ingName(ingRow)}</SheetTitle>
              </SheetHeader>
              <p className="mt-2 text-sm text-muted-foreground">Recept: {p.raw.fileName}</p>
              {files
                .filter((f) => f.linkRow === ingRow && f.linkState === "linked")
                .map((f) => (
                  <div key={f.id} className="mt-4">
                    <p className="text-sm">
                      Specifikáció: <b>{f.name}</b>
                    </p>
                    {SECTIONS.map(([title, test]) => {
                      const items = f.fields.filter((x) => test(x.key));
                      if (!items.length) return null;
                      return (
                        <div key={title} className="mt-4">
                          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            {title}
                          </h3>
                          <ul className="divide-y rounded-xl border text-sm">
                            {items.map((x) => (
                              <li key={x.key}>
                                <button
                                  className="flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                                  onClick={() => onTrace(x.key, fieldTrace(f, x))}
                                >
                                  <span className="text-muted-foreground">{x.label}</span>
                                  <span className="text-right font-medium">
                                    {x.value} {x.unit} {x.tolerance}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {f.regulatory.length > 0 && (
                      <div className="mt-4">
                        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          Jogszabályok
                        </h3>
                        <ul className="space-y-1 text-sm">
                          {f.regulatory.map((r) => (
                            <li key={r.id} className="flex justify-between">
                              <span>{r.identifier}</span>
                              <RegBadge status={r.status} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              {!files.some((f) => f.linkRow === ingRow && f.linkState === "linked") && (
                <p className="mt-6 text-sm text-muted-foreground">
                  Ehhez az alapanyaghoz nincs kapcsolt specifikáció.
                </p>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const SECTIONS: [string, (k: string) => boolean][] = [
  ["Általános adatok", (k) => ["product_description", "origin", "recommended_use"].includes(k)],
  [
    "Beszállító",
    (k) => ["supplier", "manufacturer", "address", "telephone", "email", "contact"].includes(k),
  ],
  ["Összetétel", (k) => ["composition", "allergens"].includes(k)],
  ["Tápérték", (k) => k.startsWith("n.")],
  ["Tárolás", (k) => ["storage_conditions", "shelf_life"].includes(k)],
  ["Szállítás", (k) => k === "transport_conditions"],
  ["Csomagolás", (k) => /packaging/.test(k)],
  ["Minőségi paraméterek", (k) => k.startsWith("q.")],
];

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 flex-1 font-medium">{children}</dd>
    </div>
  );
}

function Block({
  title,
  level,
  children,
}: {
  title: string;
  level: CheckLevel;
  children: ReactNode;
}) {
  return (
    <div data-anchor={title} className="rounded-2xl">
      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold uppercase tracking-wide">{title}</h2>
          <LevelIcon level={level} className="size-6" />
        </div>
        {children}
      </Panel>
    </div>
  );
}

function FieldBlock({
  title,
  items,
  onTrace,
  ingName,
  empty,
}: {
  title: string;
  items: { f: SourceFile; x: ExtractedField }[];
  onTrace: Props["onTrace"];
  ingName: (r?: number) => string;
  empty?: string;
}) {
  return (
    <Block title={title} level="ok">
      {items.length ? (
        <ul className="divide-y text-sm">
          {items.map(({ f, x }, i) => (
            <li key={i}>
              <button
                className="flex w-full flex-wrap items-baseline justify-between gap-x-3 py-2 text-left hover:bg-muted/40"
                onClick={() => onTrace(x.key, fieldTrace(f, x))}
              >
                <span>
                  <span className="font-medium">{x.label}</span>{" "}
                  <span className="text-xs text-muted-foreground">· {ingName(f.linkRow)}</span>
                </span>
                <span className="text-right">
                  {x.value}
                  <span className="block text-[11px] text-muted-foreground">
                    Forrás: {SOURCE_TYPE_LABELS[f.sourceType].toLowerCase()}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty ?? "Nincs adat a specifikációkban."}</p>
      )}
    </Block>
  );
}

function OpenBtn({ id }: { id: string }) {
  return (
    <button
      type="button"
      aria-label="Forrás megnyitása"
      title="Forrás megnyitása (helyben tárolt eredeti)"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary"
      onClick={() =>
        void openSource(id).then((ok) => {
          if (!ok) toast.info("Az eredeti fájl nincs eltárolva ezen az eszközön.");
        })
      }
    >
      <ExternalLink className="size-4" />
    </button>
  );
}
