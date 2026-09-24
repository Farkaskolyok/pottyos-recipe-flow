export function huNumber(n: number, decimals: number): string {
  return n.toLocaleString("hu-HU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function huDate(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${huNumber(bytes / 1024, 1)} KB`;
  return `${huNumber(bytes / 1024 / 1024, 1)} MB`;
}

export function colLetter(idx: number): string {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
