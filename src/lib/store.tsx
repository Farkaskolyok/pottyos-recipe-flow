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
  /** DEMO (true) or LIVE TEST (false). Controls visibility and demo seeding only. */
  demoMode: boolean;
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
  setDemoMode: (on: boolean) => void;
  /** Every stored product, including hidden demo records (backup, file bookkeeping). */
  allProducts: Product[];
  allDictionary: DictionaryEntry[];
  rawSettings: Settings;
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
    demoMode: true,
  };
}

/* ---------- demo / live separation (pure, tested) ---------- */
const isDemoProduct = (p: Product) => p.isDemo === true;
export function visibleProducts(s: Pick<State, "products" | "demoMode">) {
  return s.demoMode ? s.products : s.products.filter((p) => !isDemoProduct(p));
}
export function visibleDictionary(s: Pick<State, "dictionary" | "demoMode">) {
  return s.demoMode ? s.dictionary : s.dictionary.filter((d) => !d.isDemo);
}
/** In LIVE TEST, fictional placeholder defaults are never used in documents. */
export function effectiveSettings(settings: Settings, demoMode: boolean): Settings {
  if (demoMode) return settings;
  const blank = (v: string, d: string) => (v === d ? "" : v);
  return {
    ...settings,
    manufacturer: blank(settings.manufacturer, DEFAULT_SETTINGS.manufacturer),
    distributor: blank(settings.distributor, DEFAULT_SETTINGS.distributor),
    userName: settings.userName === DEFAULT_SETTINGS.userName ? "Felhasználó" : settings.userName,
  };
}
/** Replaces demo records only. Real products, files, settings, rules and audit stay untouched. */
export function resetDemoState(s: State): State {
  const real = s.products.filter((p) => !isDemoProduct(p));
  const realDict = s.dictionary.filter((d) => !d.isDemo);
  return {
    ...s,
    products: [...seedProducts(DEMO_DICTIONARY, DEFAULT_SETTINGS.userName), ...real],
    dictionary: [...realDict, ...DEMO_DICTIONARY],
  };
}
/** Merges a saved state. Demo seeding happens only in DEMO mode. */
export function mergeSaved(saved: Partial<State>, base: State): State {
  const demoMode = saved.demoMode ?? true;
  const known = new Set(DEMO_DICTIONARY.map((d) => d.id));
  const sd = (saved.dictionary ?? []).map((d) => (known.has(d.id) ? { ...d, isDemo: true } : d));
  const dictionary: DictionaryEntry[] = demoMode
    ? [...sd, ...DEMO_DICTIONARY.filter((d) => !sd.some((x) => x.id === d.id))]
    : sd;
  // one-time migration of records saved before the explicit isDemo field existed
  let products: Product[] = (saved.products ?? []).map((p) =>
    typeof p.isDemo === "boolean"
      ? p
      : {
          ...p,
          isDemo: /^Demo_.+_recipe\.xlsx$/.test(p.raw.fileName) || !!p.files?.some((f) => f.demo),
        },
  );
  if (demoMode && !products.some((p) => p.isDemo && p.files?.length))
    products = [demoPackageProduct(dictionary, base.settings.userName), ...products];
  return {
    ...base,
    ...saved,
    demoMode,
    dictionary,
    products,
    settings: { ...base.settings, ...saved.settings },
    categories: { ...base.categories, ...saved.categories },
  } as State;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    products: [],
    dictionary: DEMO_DICTIONARY,
    settings: DEFAULT_SETTINGS,
    rules: DEFAULT_RULES,
    admin: true,
    categories: DEFAULT_CATEGORIES,
    demoMode: true,
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
      const next: State = saved?.products && saved.dictionary ? mergeSaved(saved, base) : base;
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
      products: visibleProducts(state),
      dictionary: visibleDictionary(state),
      settings: effectiveSettings(state.settings, state.demoMode),
      allProducts: state.products,
      allDictionary: state.dictionary,
      rawSettings: state.settings,
      ready,
      upsertProduct,
      removeProduct: (id) =>
        setState((s) => {
          const p = s.products.find((x) => x.id === id);
          if (p) for (const f of productFileIds(p)) void deleteSourceFile(f);
          return { ...s, products: s.products.filter((x) => x.id !== id) };
        }),
      getProduct: (id) => visibleProducts(state).find((p) => p.id === id),
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
        const next = resetDemoState(state);
        setState(next);
        void syncLocalFiles(next.products);
      },
      setDemoMode: (on) =>
        setState((s) => {
          if (!on) return { ...s, demoMode: false };
          const hasDemo = s.products.some((p) => p.isDemo);
          const next = hasDemo
            ? { ...s, demoMode: true }
            : { ...resetDemoState(s), demoMode: true };
          if (!hasDemo) void syncLocalFiles(next.products);
          return next;
        }),
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
