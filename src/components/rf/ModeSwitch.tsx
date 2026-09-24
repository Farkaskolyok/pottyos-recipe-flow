import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStore } from "@/lib/store";

/** Demó mód ON/OFF. Only changes visibility and demo seeding – never deletes data. */
export function ModeSwitch({ className = "" }: { className?: string }) {
  const { demoMode, setDemoMode, ready } = useStore();
  const [ask, setAsk] = useState<null | boolean>(null);
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <label htmlFor="demo-mode" className="text-sm font-semibold">
        Demó mód
      </label>
      <Switch
        id="demo-mode"
        checked={demoMode}
        disabled={!ready}
        onCheckedChange={(v) => setAsk(v)}
      />
      {!demoMode && <LiveBadge />}
      <AlertDialog open={ask != null} onOpenChange={(o) => !o && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ask ? "Demó adatok megjelenítése?" : "Átváltasz éles teszt módra?"}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>MÉGSE</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ask != null) setDemoMode(ask);
                setAsk(null);
              }}
            >
              {ask ? "DEMÓ BEKAPCSOLÁSA" : "ÁTVÁLTÁS"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function LiveBadge() {
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
      ÉLES TESZT
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground">
      DEMÓ
    </span>
  );
}
