import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDesktop, openDesktopSource, saveDownload } from "@/lib/platform";
import { openSource, persistSourceFile, verifyRegulationOnline } from "@/lib/recipe/sources";
import { setupPwa } from "@/lib/pwa";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
  vi.stubEnv("VITE_DESKTOP", "1");
  invoke.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("desktop file operations", () => {
  it("saves exact binary bytes through the native dialog and propagates cancellation", async () => {
    const blob = new Blob([new Uint8Array([0, 127, 128, 255])]);
    invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await saveDownload(blob, "Recept.docx")).toBe(true);
    expect(invoke).toHaveBeenCalledWith("save_document", {
      name: "Recept.docx",
      data: [0, 127, 128, 255],
    });
    expect(await saveDownload(blob, "Recept.docx")).toBe(false);
  });

  it("opens stored originals natively without creating a browser popup", async () => {
    const popup = vi.spyOn(window, "open");
    invoke.mockResolvedValue(undefined);
    await persistSourceFile("desktop-source", new File(["original"], "Source.docx"));
    expect(await openSource("desktop-source")).toBe(true);
    expect(invoke).toHaveBeenCalledWith("open_source_file", {
      name: "Source.docx",
      data: Array.from(new TextEncoder().encode("original")),
    });
    expect(popup).not.toHaveBeenCalled();
    expect(await openSource("missing-desktop-source")).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("opens fictional text placeholders with a text extension", async () => {
    await openDesktopSource(new Blob(["demo"], { type: "text/plain;charset=utf-8" }), "Demo.docx");
    expect(invoke).toHaveBeenCalledWith("open_source_file", {
      name: "Demo.docx.txt",
      data: [100, 101, 109, 111],
    });
  });

  it("keeps browser downloads working outside the desktop build", async () => {
    vi.stubEnv("VITE_DESKTOP", "0");
    const create = vi.fn(() => "blob:download");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(isDesktop()).toBe(false);
    expect(await saveDownload(new Blob(["backup"]), "backup.json")).toBe(true);
    expect(click).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not call a backend or register a service worker in desktop mode", async () => {
    const fetch = vi.fn();
    const register = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: { register } });
    expect(await verifyRegulationOnline("1169/2011/EU")).toEqual({ kind: "offline" });
    await setupPwa();
    expect(fetch).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
