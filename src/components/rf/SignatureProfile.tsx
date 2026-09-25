import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import {
  profileFor,
  readSignatureFile,
  setOwnSignature,
  SIGN_ROLES,
  type SignRole,
} from "@/lib/recipe/signatures";

/** The current user's own profile: role + JPG signature. Other users' signatures are never editable here. */
export function SignatureProfile() {
  const { settings, setSettings } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const me = settings.userName;
  const users = settings.users ?? [];
  const mine = profileFor(users, me);
  const patch = (x: Parameters<typeof setOwnSignature>[3]) =>
    setSettings({ ...settings, users: setOwnSignature(users, me, me, x) });

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-xs font-bold tracking-wide text-muted-foreground">ALÁÍRÁS</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Szerepkör</Label>
          <Select value={mine?.role ?? "KÉSZÍTŐ"} onValueChange={(v) => patch({ role: v as SignRole })}>
            <SelectTrigger className="mt-1" aria-label="Szerepkör">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIGN_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Aláírás (JPG)</Label>
          <div className="mt-1 flex items-center gap-2">
            {mine?.signatureImage ? (
              <img
                src={mine.signatureImage}
                alt={`${me} aláírása`}
                className="h-10 max-w-[9rem] rounded border bg-background object-contain"
              />
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
            <input
              ref={input}
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              className="hidden"
              aria-label="Aláírás feltöltése"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  patch({ signatureImage: await readSignatureFile(f) });
                  toast.success("Aláírás mentve");
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  e.target.value = "";
                }
              }}
            />
            <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
              Feltöltés
            </Button>
            {mine?.signatureImage && (
              <Button size="sm" variant="ghost" onClick={() => patch({ signatureImage: undefined })}>
                Törlés
              </Button>
            )}
          </div>
        </div>
      </div>
      {users.filter((u) => u.name !== me).length > 0 && (
        <ul className="divide-y text-sm">
          {users
            .filter((u) => u.name !== me)
            .map((u) => (
              <li key={u.name} className="flex justify-between py-1.5">
                <span>{u.name}</span>
                <span className="text-muted-foreground">
                  {u.role} · {u.signatureImage ? "✓ aláírás" : "—"}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
