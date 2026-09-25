// Stored user signatures + signature slots for FINAL Word exports. Pure and deterministic.
import type { Product } from "./types";
import { checkerOf, samePerson } from "./approval";

export type SignRole = "KÉSZÍTŐ" | "ELLENŐR" | "JÓVÁHAGYÓ";
export const SIGN_ROLES: SignRole[] = ["KÉSZÍTŐ", "ELLENŐR", "JÓVÁHAGYÓ"];

export interface UserProfile {
  name: string;
  role: SignRole;
  /** data:image/jpeg;base64,… — only ever uploaded by the user themself */
  signatureImage?: string;
  updatedAt?: string;
}

export type SlotKey = "CREATED" | "CHECKED" | "APPROVED";
export const SLOT_ROLE: Record<SlotKey, SignRole> = {
  CREATED: "KÉSZÍTŐ",
  CHECKED: "ELLENŐR",
  APPROVED: "JÓVÁHAGYÓ",
};

export interface SigImage {
  bytes: Uint8Array;
  cx: number;
  cy: number;
}
export interface Slot {
  name: string;
  at: string;
  date: string;
  image?: SigImage;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local date, format YYYY.MM.DD. */
export function ymd(d: Date | string = new Date()) {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}.${pad(x.getMonth() + 1)}.${pad(x.getDate())}.`;
}

export function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

/** Reads pixel size from the JPEG SOF marker. */
export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (!isJpeg(b)) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}

export const CM = 360000; // EMU per cm
export const MAX_W = 3.8 * CM;
export const MAX_H = 1.8 * CM;

/** Fit into the max box keeping aspect ratio (never stretched). */
export function fitEmu(w: number, h: number) {
  const s = Math.min(MAX_W / w, MAX_H / h);
  return { cx: Math.round(w * s), cy: Math.round(h * s) };
}

export function profileFor(users: UserProfile[], name?: string) {
  return name ? users.find((u) => samePerson(u.name, name)) : undefined;
}

function image(users: UserProfile[], name: string): SigImage | undefined {
  const u = profileFor(users, name);
  if (!u?.signatureImage) return undefined;
  const bytes = dataUrlBytes(u.signatureImage);
  const sz = jpegSize(bytes);
  if (!sz) return undefined;
  return { bytes, ...fitEmu(sz.w, sz.h) };
}

/**
 * Signature slots for a product. Only completed workflow actions produce a slot; images come
 * exclusively from the profile whose name equals the person who performed that action, and only
 * for FINAL exports.
 */
export function signatureSlots(p: Product, users: UserProfile[], final: boolean) {
  const out: Partial<Record<SlotKey, Slot>> = {};
  const add = (k: SlotKey, name?: string, at?: string) => {
    if (!name || !at) return;
    out[k] = { name, at, date: ymd(at), image: final ? image(users, name) : undefined };
  };
  add("CREATED", p.createdBy, p.createdAt);
  const c = checkerOf(p);
  if (c && !samePerson(c, p.createdBy)) add("CHECKED", c, p.checkedAt);
  if (p.status === "approved") add("APPROVED", p.approvedBy, p.approvedAt);
  return out;
}

/** Word fields: {{X_BY}}, {{X_DATE}}; plus today's local date for {{date}} on final export. */
export function signatureFields(slots: Partial<Record<SlotKey, Slot>>, final: boolean, now = new Date()) {
  const f: Record<string, string> = {};
  for (const k of ["CREATED", "CHECKED", "APPROVED"] as SlotKey[]) {
    f[`${k}_BY`] = slots[k]?.name ?? "";
    f[`${k}_DATE`] = slots[k]?.date ?? "";
  }
  if (final) f.date = ymd(now);
  return f;
}

/** Validates an upload: JPG only. Signature always belongs to the current user. */
export async function readSignatureFile(file: File): Promise<string> {
  if (!/^image\/jpe?g$/.test(file.type) && !/\.jpe?g$/i.test(file.name))
    throw new Error("Csak JPG / JPEG kép tölthető fel.");
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!jpegSize(buf)) throw new Error("A fájl nem érvényes JPG kép.");
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

export function setOwnSignature(
  users: UserProfile[],
  currentUser: string,
  target: string,
  patch: Partial<UserProfile>,
): UserProfile[] {
  if (!samePerson(currentUser, target))
    throw new Error("Más felhasználó aláírása nem módosítható.");
  const i = users.findIndex((u) => samePerson(u.name, target));
  const next: UserProfile = {
    ...(i >= 0 ? users[i] : { name: target, role: "KÉSZÍTŐ" }),
    ...patch,
    name: target,
    updatedAt: new Date().toISOString(),
  };
  return i >= 0 ? users.map((u, j) => (j === i ? next : u)) : [...users, next];
}
