import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { ProductActions } from "@/components/rf/ProductActions";
import { loadFileBlob, saveFileBlob } from "@/lib/idb";

type S = ReturnType<typeof useStore>;
let api: S | null = null;
function Harness({ onDeleted }: { onDeleted?: () => void }) {
  const s = useStore();
  useEffect(() => {
    api = s;
  });
  if (!s.ready) return <span>…</span>;
  const p = s.products[0];
  return (
    <div>
      <span>n={s.products.length}</span>
      {p && <ProductActions id={p.id} name="Teszt termék" onDeleted={onDeleted} />}
    </div>
  );
}

async function openDialog() {
  const u = userEvent.setup();
  await u.click(await screen.findByRole("button", { name: "Műveletek" }));
  await u.click(await screen.findByText("Termék törlése"));
  await screen.findByText("Biztosan törlöd ezt a terméket?");
  expect(screen.getByText("Teszt termék")).toBeTruthy();
  expect(screen.getByText(/helyi fájlok is törlődnek/)).toBeTruthy();
  return u;
}

describe("termék törlése", () => {
  it("cancel keeps, confirm removes only that product with its blobs", async () => {
    let deleted = false;
    render(
      <StoreProvider>
        <Harness onDeleted={() => (deleted = true)} />
      </StoreProvider>,
    );
    await screen.findByText(/n=\d+/);
    await new Promise((r) => setTimeout(r, 800));
    const before = api!.products.length;
    expect(before).toBeGreaterThan(1);
    const target = api!.products[0];
    const others = api!.products.slice(1).map((p) => p.id);
    const dictLen = api!.dictionary.length;
    const settings = JSON.stringify(api!.rawSettings);
    const ids = [`recipe:${target.id}`, ...(target.files ?? []).map((f) => f.id)];
    for (const id of ids) await saveFileBlob(id, new Blob(["x"]), id);

    let u = await openDialog();
    await u.click(screen.getByRole("button", { name: "MÉGSE" }));
    expect(api!.products.length).toBe(before);
    expect(deleted).toBe(false);

    u = await openDialog();
    await u.click(screen.getByRole("button", { name: "TÖRLÉS" }));
    await waitFor(() => expect(api!.products.find((p) => p.id === target.id)).toBeUndefined());
    expect(deleted).toBe(true);
    expect(api!.products.map((p) => p.id)).toEqual(others);
    expect(api!.dictionary.length).toBe(dictLen);
    expect(JSON.stringify(api!.rawSettings)).toBe(settings);
    await waitFor(async () => {
      for (const id of ids) expect(await loadFileBlob(id)).toBeUndefined();
    });
  });
});
