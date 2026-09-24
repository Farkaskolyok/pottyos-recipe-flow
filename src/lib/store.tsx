import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DictionaryEntry, Product } from "./recipe/types";
import { DEMO_DICTIONARY } from "./recipe/dictionary";
import { DEFAULT_SETTINGS, type Settings } from "./recipe/engine";
import { DEFAULT_RULES, type RuleDef } from "./recipe/rules";
import { demoPackageProduct, seedProducts } from "./recipe/demo";
import { DEFAULT_CATEGORIES } from "./recipe/fields";

type Categories = Record<string, { label: string; options: string[] }>;

// Local-only persistence (browser storage). No data leaves the device.
const KEY = "recipeflow.v1";

interface State {
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
}

const Ctx = createContext<Store | null>(null);

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
  const [state, setState] = useState<State>({ products: [], dictionary: DEMO_DICTIONARY, settings: DEFAULT_SETTINGS, rules: DEFAULT_RULES, admin: true, categories: DEFAULT_CATEGORIES });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const base = initial();
      const saved = raw ? JSON.parse(raw) : null;
      if (saved) {
        const dictionary: DictionaryEntry[] = [...saved.dictionary, ...DEMO_DICTIONARY.filter((d) => !saved.dictionary.some((x: DictionaryEntry) => x.id === d.id))];
        const products: Product[] = saved.products.some((p: Product) => p.files?.length) ? saved.products : [demoPackageProduct(dictionary, base.settings.userName), ...saved.products];
        setState({ ...base, ...saved, dictionary, products, settings: { ...base.settings, ...saved.settings }, categories: { ...base.categories, ...saved.categories } });
      } else setState(base);
    } catch {
      setState(initial());
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, ready]);

  const upsertProduct = useCallback((p: Product) => {
    setState((s) => {
      const exists = s.products.some((x) => x.id === p.id);
      const next = { ...p, updatedAt: new Date().toISOString() };
      return { ...s, products: exists ? s.products.map((x) => (x.id === p.id ? next : x)) : [next, ...s.products] };
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      ...state,
      ready,
      upsertProduct,
      removeProduct: (id) => setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) })),
      getProduct: (id) => state.products.find((p) => p.id === id),
      upsertEntry: (e) =>
        setState((s) => ({
          ...s,
          dictionary: s.dictionary.some((x) => x.id === e.id) ? s.dictionary.map((x) => (x.id === e.id ? e : x)) : [...s.dictionary, e],
        })),
      setSettings: (settings) => setState((s) => ({ ...s, settings })),
      setRules: (rules) => setState((s) => ({ ...s, rules })),
      setAdmin: (admin) => setState((s) => ({ ...s, admin })),
      resetDemo: () => setState(initial()),
      addCategory: (id, value) =>
        setState((s) => ({
          ...s,
          categories: { ...s.categories, [id]: { ...s.categories[id], options: [...new Set([...(s.categories[id]?.options ?? []), value])] } },
        })),
    }),
    [state, ready, upsertProduct],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
