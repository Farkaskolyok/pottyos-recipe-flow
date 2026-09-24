import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { EditProvider, InlineField, type EditApi } from "@/components/rf/InlineField";
import { StepFooter, ValidationStep } from "@/components/rf/Workflow";
import { DocPreview } from "@/components/rf/DocPreview";
import type { Check, TracedValue } from "@/lib/recipe/types";
import { buildDemoWorkbook, DEMO_RECIPES, newProduct } from "@/lib/recipe/demo";
import { parseWorkbook } from "@/lib/recipe/parse";
import { DEMO_DICTIONARY } from "@/lib/recipe/dictionary";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import { buildDocs } from "@/lib/recipe/documents";
import { fixTarget } from "@/lib/recipe/fixes";
import { loadFileBlob } from "@/lib/idb";
import { getSourceBlob, persistSourceFile } from "@/lib/recipe/sources";

function Harness({ initial, fieldKey, focusKey }: { initial: Record<string, string>; fieldKey: string; focusKey?: string }) {
  const [vals, setVals] = useState(initial);
  const [orig] = useState(initial);
  const [focus, setFocus] = useState<string | null>(focusKey ?? null);
  const { ready } = useStore();
  const api: EditApi = {
    get: (k): TracedValue => ({ label: k, original: orig[k], calculated: null, display: vals[k], origin: vals[k] === orig[k] ? "source" : "manual", manual: vals[k] === orig[k] ? undefined : { value: vals[k], previous: orig[k], by: "T", at: new Date().toISOString() } } as TracedValue),
    set: (k, v) => setVals((s) => ({ ...s, [k]: v })),
    restore: (k) => setVals((s) => ({ ...s, [k]: orig[k] })),
    focusKey: focus,
    clearFocus: () => setFocus(null),
  };
  if (!ready) return null;
  return (
    <EditProvider value={api}>
      <div data-testid="val">{vals[fieldKey]}</div>
      <InlineField fieldKey={fieldKey} />
    </EditProvider>
  );
}
const wrap = (ui: React.ReactNode) => render(<StoreProvider>{ui}</StoreProvider>);

describe("inline edit", () => {
  it("edits a text value with pencil → ✓", async () => {
    const u = userEvent.setup();
    wrap(<Harness initial={{ marketingName: "Régi" }} fieldKey="marketingName" />);
    await u.click(await screen.findByLabelText("Érték módosítása"));
    const input = screen.getAllByRole("textbox")[0];
    await u.clear(input);
    await u.type(input, "Új név{Enter}");
    await waitFor(() => expect(screen.getByTestId("val")).toHaveTextContent("Új név"));
  });
  it("Esc cancels without saving", async () => {
    const u = userEvent.setup();
    wrap(<Harness initial={{ marketingName: "Régi" }} fieldKey="marketingName" />);
    await u.click(await screen.findByLabelText("Érték módosítása"));
    await u.type(screen.getAllByRole("textbox")[0], "xxx{Escape}");
    expect(screen.getByTestId("val")).toHaveTextContent("Régi");
  });
  it("fix navigation opens the field directly in edit mode with focus", async () => {
    wrap(<Harness initial={{ marketingName: "" }} fieldKey="marketingName" focusKey="marketingName" />);
    const input = (await screen.findAllByRole("textbox"))[0];
    expect(input).toHaveFocus();
  });
  it("dropdown field offers only approved values", async () => {
    const u = userEvent.setup();
    wrap(<Harness initial={{ storageMode: "Hűtve tárolandó" }} fieldKey="storageMode" />);
    await u.click(await screen.findByLabelText("Érték módosítása"));
    const opts = await screen.findAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual(expect.arrayContaining(["Hűtve tárolandó", "Fagyasztva tárolandó"]));
    await u.click(screen.getByRole("option", { name: "Fagyasztva tárolandó" }));
    await waitFor(() => expect(screen.getByTestId("val")).toHaveTextContent("Fagyasztva tárolandó"));
  });
});

const checks: Check[] = [
  { id: "recipe", level: "ok", text: "Recept beolvasva" },
  { id: "mkt", level: "warn", text: "Termék kereskedelmi neve nincs megadva", action: "set-value", field: "marketingName" },
  { id: "unk", level: "error", text: "2 ismeretlen alapanyag", action: "resolve-ingredients" },
  { id: "src-link", level: "warn", text: "1 bizonytalan alapanyag-kapcsolat", action: "sources" },
  { id: "src-reg", level: "error", text: "1334/2008/EK ellenőrzendő", action: "sources" },
];

describe("validation task list", () => {
  it("lists every open issue with its fix button", async () => {
    const onFix = vi.fn();
    render(<ValidationStep checks={checks} onFix={onFix} onAck={() => {}} admin />);
    expect(screen.getByText("4 javítandó tétel")).toBeInTheDocument();
    expect(screen.getByText("✓ 1 ellenőrzés rendben")).toBeInTheDocument();
    for (const label of ["JAVÍTÁS", "ALAPANYAGOK JAVÍTÁSA", "ÖSSZEKAPCSOLÁS", "ELLENŐRZÉS"]) expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ÖSSZEKAPCSOLÁS" }));
    expect(onFix).toHaveBeenCalledWith(checks[3]);
    expect(fixTarget(checks[1])).toMatchObject({ step: "Adatok", field: "marketingName", anchor: "field:marketingName" });
  });
});

describe("step navigation", () => {
  it("VISSZA / TOVÁBB and blocking list", async () => {
    const onNext = vi.fn();
    const onFix = vi.fn();
    const { rerender } = render(<StepFooter step="Alapanyagok" blocked={null} onBack={() => {}} onNext={onNext} onFix={onFix} onForce={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "TOVÁBB" }));
    expect(onNext).toHaveBeenCalled();
    rerender(<StepFooter step="Alapanyagok" blocked={[checks[2]]} onBack={() => {}} onNext={onNext} onFix={onFix} onForce={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("1 tételt még javítani kell");
    await userEvent.click(screen.getByRole("button", { name: "ALAPANYAGOK JAVÍTÁSA" }));
    expect(onFix).toHaveBeenCalledWith(checks[2]);
  });
  it("first step has disabled VISSZA, last step has no TOVÁBB", () => {
    const { rerender } = render(<StepFooter step="Források" blocked={null} onBack={() => {}} onNext={() => {}} onFix={() => {}} onForce={() => {}} />);
    expect(screen.getByRole("button", { name: "VISSZA" })).toBeDisabled();
    rerender(<StepFooter step="Jóváhagyás" blocked={null} onBack={() => {}} onNext={() => {}} onFix={() => {}} onForce={() => {}} />);
    expect(screen.queryByRole("button", { name: "TOVÁBB" })).toBeNull();
  });
});

describe("document preview", () => {
  it("renders all three documents from the same data", () => {
    const p = newProduct(parseWorkbook(buildDemoWorkbook(DEMO_RECIPES[0]), "t.xlsx", 1), DEMO_DICTIONARY, "T");
    const ds = buildDataset(p, DEMO_DICTIONARY, DEFAULT_SETTINGS);
    const docs = buildDocs(p, ds, DEMO_DICTIONARY, DEFAULT_SETTINGS);
    for (const k of ["sheet", "spec", "pack"] as const) {
      const { container, unmount } = wrap(<DocPreview doc={docs[k]} />);
      expect(within(container).getAllByText(docs[k].title, { exact: false }).length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe("persistent original files", () => {
  it("stores the uploaded original in IndexedDB so it survives reload", async () => {
    const f = new File(["PDF-TARTALOM"], "Spec.pdf", { type: "application/pdf" });
    await persistSourceFile("f1", f);
    const rec = await loadFileBlob("f1");
    expect(rec?.name).toBe("Spec.pdf");
    expect(rec!.size).toBe(12);
    expect((await getSourceBlob("f1"))?.name).toBe("Spec.pdf");
  });
});
