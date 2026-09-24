import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DictionaryEntry, Product } from "./recipe/types";
import { DEMO_DICTIONARY } from "./recipe/dictionary";
import { DEFAULT_SETTINGS, type Settings } from "./recipe/engine";
import { DEFAULT_RULES, type RuleDef } from "./recipe/rules";
import { seedProducts } from "./recipe/demo";

// Local-only persistence (browser storage). No data leaves the device.
const KEY = "recipeflow.v1";

interface State {
  products: Product[];
  dictionary: DictionaryEntry[];
  settings: Settings;
  rules: RuleDef[];
  admin: boolean;
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
}

const Ctx = createContext<Store | null>(null);

function initial(): State {
  return {
    products: seedProducts(DEMO_DICTIONARY, DEFAULT_SETTINGS.userName),
    dictionary: DEMO_DICTIONARY,
    settings: DEFAULT_SETTINGS,
    rules: DEFAULT_RULES,
    admin: true,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ products: [], dictionary: DEMO_DICTIONARY, settings: DEFAULT_SETTINGS, rules: DEFAULT_RULES, admin: true });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setState(raw ? { ...initial(), ...JSON.parse(raw) } : initial());
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
