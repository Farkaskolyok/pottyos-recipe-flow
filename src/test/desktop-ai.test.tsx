import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiReview } from "@/components/rf/AiReview";
import { buildDataset, DEFAULT_SETTINGS } from "@/lib/recipe/engine";
import { buildDemoWorkbook, DEMO_RECIPES, newProduct } from "@/lib/recipe/demo";
import { parseWorkbook } from "@/lib/recipe/parse";
import { DEMO_DICTIONARY } from "@/lib/recipe/dictionary";

const { run, error } = vi.hoisted(() => ({ run: vi.fn(), error: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => run }));
vi.mock("@/lib/ai.functions", () => ({ aiAnalyze: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error } }));
vi.mock("@/lib/store", () => ({
  useStore: () => ({ settings: { userName: "Test" }, rawSettings: { aiEnabled: true } }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("shows the requested unavailable message without contacting a server, even offline", async () => {
  vi.stubEnv("VITE_DESKTOP", "1");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const p = newProduct(
    parseWorkbook(buildDemoWorkbook(DEMO_RECIPES[3]), "demo.xlsx", 1),
    DEMO_DICTIONARY,
    "Test",
  );
  const ds = buildDataset(p, DEMO_DICTIONARY, DEFAULT_SETTINGS);
  render(<AiReview p={p} ds={ds} onChange={vi.fn()} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "AI ADATELLENŐRZÉS" }));
  expect(error).toHaveBeenCalledWith("Az AI szolgáltatás nincs implementálva");
  expect(run).not.toHaveBeenCalled();
});
