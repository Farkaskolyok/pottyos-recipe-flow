import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DictionaryEntry, Product } from "./recipe/types";
import { DEMO_DICTIONARY } from "./recipe/dictionary";
import { DEFAULT_SETTINGS, type Settings } from "./recipe/engine";
import { DEFAULT_RULES, type RuleDef } from "./recipe/rules";
import { DEMO_RECIPES, demoFile, demoPackageProduct, seedProducts } from "./recipe/demo";
import { DEFAULT_CATEGORIES } from "./recipe/fields";
import {
  idbAvailable,
  idbGet,
  idbPut,
  loadFileBlob,
  purgeOrphanFiles,
  saveFileBlob,
  STORES,
} from "./idb";
import {
  deleteSourceFile,
  ensureDemoSourceBlobs,
  productFileIds,
  recipeFileId,
} from "./recipe/sources";
import { ensureMasterTemplates } from "./recipe/docxTemplate";

type Categories = Record<string, { label: string; options: string[] }>;

// Local-only persistence (IndexedDB on this device). No data leaves the device.
const KEY = "recipeflow.v1"; // legacy localStorage key, migrated once
const IDB_KEY = "app";

export interface State {
  products: Product[];
  dictionary: DictionaryEntry[];
  settings: Settings;
  rules: RuleDef[];
  admin: boolean;
  categories: Categories;
}

interface Store extends State {
  ready: boolean;
  upsertProduct: (p: Product) => void;
  removeProduct: (id: string) => void;
  getProduct: (id: string) => Product | undefined;
  upsertEntry: (e: DictionaryEntry) => void;
  setSettings: (s: Settings) => void;
  setRules: (r: RuleDef[]) => void;
  setAdmin: (a: boolean) => void;
  resetDemo: () => void;
  addCategory: (id: string, value: string) => void;
  replaceState: (s: State) => void;
}

// Keep one context instance across hot reloads so provider and consumers always match.
const g = globalThis as unknown as { __rfStoreCtx?: React.Context<Store | null> };
const Ctx = (g.__rfStoreCtx ??= createContext<Store | null>(null));

function initial(): State {
  return {
    products: seedProducts(DEMO_DICTIONARY, DEFAULT_SETTINGS.userName),
    dictionary: DEMO_DICTIONARY,
    settings: DEFAULT_SETTINGS,
    rules: DEFAULT_RULES,
    admin: true,
    categories: DEFAULT_CATEGORIES,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    products: [],
    dictionary: DEMO_DICTIONARY,
    settings: DEFAULT_SETTINGS,
    rules: DEFAULT_RULES,
    admin: true,
    categories: DEFAULT_CATEGORIES,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const base = initial();
      let saved: Partial<State> | null = null;
      try {
        if (idbAvailable()) saved = (await idbGet<State>(STORES.state, IDB_KEY)) ?? null;
        if (!saved) {
          const raw = localStorage.getItem(KEY);
          saved = raw ? JSON.parse(raw) : null;
        }
      } catch {
        saved = null;
      }
      let next: State = base;
      if (saved?.products && saved.dictionary) {
        const sd = saved.dictionary;
        const dictionary: DictionaryEntry[] = [
          ...sd,
          ...DEMO_DICTIONARY.filter((d) => !sd.some((x) => x.id === d.id)),
        ];
        const products: Product[] = saved.products.some((p) => p.files?.length)
          ? saved.products
          : [demoPackageProduct(dictionary, base.settings.userName), ...saved.products];
        next = {
          ...base,
          ...saved,
          dictionary,
          products,
          settings: { ...base.settings, ...saved.settings },
          categories: { ...base.categories, ...saved.categories },
        } as State;
      }
      if (!alive) return;
      setState(next);
      setReady(true);
      void syncLocalFiles(next.products);
      void ensureMasterTemplates();
      void navigator.storage?.persist?.().catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      if (idbAvailable())
        idbPut(STORES.state, IDB_KEY, state)
          .then(() => localStorage.removeItem(KEY))
          .catch(() => localStorage.setItem(KEY, JSON.stringify(state)));
      else localStorage.setItem(KEY, JSON.stringify(state));
    }, 150);
    return () => window.clearTimeout(t);
  }, [state, ready]);

  const upsertProduct = useCallback((p: Product) => {
    setState((s) => {
      const exists = s.products.some((x) => x.id === p.id);
      const next = { ...p, updatedAt: new Date().toISOString() };
      return {
        ...s,
        products: exists
          ? s.products.map((x) => (x.id === p.id ? next : x))
          : [next, ...s.products],
      };
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      ...state,
      ready,
      upsertProduct,
      removeProduct: (id) =>
        setState((s) => {
          const p = s.products.find((x) => x.id === id);
          if (p) for (const f of productFileIds(p)) void deleteSourceFile(f);
          return { ...s, products: s.products.filter((x) => x.id !== id) };
        }),
      getProduct: (id) => state.products.find((p) => p.id === id),
      upsertEntry: (e) =>
        setState((s) => ({
          ...s,
          dictionary: s.dictionary.some((x) => x.id === e.id)
            ? s.dictionary.map((x) => (x.id === e.id ? e : x))
            : [...s.dictionary, e],
        })),
      setSettings: (settings) => setState((s) => ({ ...s, settings })),
      setRules: (rules) => setState((s) => ({ ...s, rules })),
      setAdmin: (admin) => setState((s) => ({ ...s, admin })),
      resetDemo: () => {
        const next = initial();
        setState(next);
        void syncLocalFiles(next.products);
      },
      replaceState: (s) => setState(s),
      addCategory: (id, value) =>
        setState((s) => ({
          ...s,
          categories: {
            ...s.categories,
            [id]: {
              ...s.categories[id],
              options: [...new Set([...(s.categories[id]?.options ?? []), value])],
            },
          },
        })),
    }),
    [state, ready, upsertProduct],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Keeps the local file store consistent with the products: removes orphaned confidential
 * originals, then recreates the fictional demo originals so "Forrás megnyitása" works.
 */
export async function syncLocalFiles(products: Product[]) {
  if (!idbAvailable()) return;
  const keep = new Set(products.flatMap(productFileIds));
  await purgeOrphanFiles(keep).catch(() => {});
  await ensureDemoSourceBlobs(products.flatMap((p) => p.files ?? []));
  for (const p of products) {
    const m = /^Demo_(.+)_recipe\.xlsx$/.exec(p.raw.fileName);
    const d = m && DEMO_RECIPES.find((r) => r.key === m[1]);
    if (!d) continue;
    const id = recipeFileId(p.id);
    if (await loadFileBlob(id).catch(() => undefined)) continue;
    const f = demoFile(d);
    await saveFileBlob(id, f, p.raw.fileName).catch(() => {});
  }
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
