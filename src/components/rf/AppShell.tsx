import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Home,
  Plus,
  Package,
  ClipboardCheck,
  BookOpen,
  SlidersHorizontal,
  FileText,
  Settings,
  Menu,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Főoldal", icon: Home, admin: false },
  { to: "/uj", label: "Új termék", icon: Plus, admin: false },
  { to: "/termekek", label: "Termékek", icon: Package, admin: false },
  { to: "/ellenorzes", label: "Ellenőrzés", icon: ClipboardCheck, admin: false },
  { to: "/szotar", label: "Alapanyag szótár", icon: BookOpen, admin: true },
  { to: "/szabalyok", label: "Szabályok", icon: SlidersHorizontal, admin: true },
  { to: "/sablonok", label: "Sablonok", icon: FileText, admin: true },
  { to: "/beallitasok", label: "Beállítások", icon: Settings, admin: false },
] as const;

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="relative inline-flex size-9 items-center justify-center rounded-full bg-primary">
        <span className="absolute left-2 top-2 size-2 rounded-full bg-primary-foreground" />
        <span className="absolute bottom-2 right-2 size-2.5 rounded-full bg-primary-foreground" />
        <span className="absolute bottom-2.5 left-2.5 size-1.5 rounded-full bg-primary-foreground" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-extrabold tracking-wide text-primary">PÖTTYÖS</span>
        <span className="block text-xs font-semibold text-muted-foreground">RecipeFlow</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { admin } = useStore();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => admin || !n.admin).map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={onNavigate}
          activeOptions={{ exact: n.to === "/" }}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          activeProps={{
            className: "bg-sidebar-accent !text-sidebar-accent-foreground font-semibold",
          }}
        >
          <n.icon className="size-[18px]" />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const mobile = NAV.slice(0, 4);
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-sidebar p-4 lg:flex">
        <div className="mb-8 px-2 pt-1">
          <Logo />
        </div>
        <NavList />
        <p className="mt-auto px-3 text-xs text-muted-foreground">
          Helyi feldolgozás – az adatok nem hagyják el ezt a gépet.
        </p>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <Sheet>
          <SheetTrigger
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Menü"
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4">
            <SheetTitle className="mb-6 mt-2">
              <Logo />
            </SheetTitle>
            <NavList />
          </SheetContent>
        </Sheet>
      </header>

      <main className="px-4 pb-28 pt-6 sm:px-6 lg:ml-60 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-background lg:hidden">
        {mobile.map((n) => {
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <n.icon className="size-5" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
