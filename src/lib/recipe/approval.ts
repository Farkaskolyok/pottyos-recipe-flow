// Four-eyes review + approval rules. Pure, deterministic, UI-independent.
import type { Product } from "./types";

export const SAME_PERSON = "A készítő és az ellenőr nem lehet ugyanaz a személy.";
export const NO_CHECKER = "Az ellenőri megerősítés hiányzik.";
export const NO_WEIGHT_SERVING =
  "1 darabra számított tápérték nem számítható – nettó tömeg hiányzik";

const norm = (s?: string) => (s ?? "").trim().toLocaleLowerCase("hu");
export const samePerson = (a?: string, b?: string) => !!norm(a) && norm(a) === norm(b);

export const checkerOf = (p: Product) => p.checkedBy ?? p.reviewedBy;

/** The creator may never check their own product. */
export function canCheck(p: Product, user: string) {
  return !!norm(user) && !samePerson(user, p.createdBy);
}

export function audit(p: Product, by: string, text: string, at = new Date().toISOString()) {
  return [...(p.audit ?? []), { at, by, text }];
}

export function checkProduct(p: Product, user: string, at = new Date().toISOString()): Product {
  if (!canCheck(p, user)) throw new Error(SAME_PERSON);
  return {
    ...p,
    checkedBy: user,
    checkedAt: at,
    reviewedBy: user,
    audit: audit(p, user, `Dokumentumok ellenőrizve: ${user}`, at),
  };
}

export function uncheckProduct(p: Product): Product {
  const { checkedBy: _a, checkedAt: _b, ...rest } = p;
  return { ...rest, reviewedBy: undefined };
}

export interface ApprovalOpts {
  /** company policy: separate approver role → approver must differ from creator */
  separateApprover?: boolean;
}

/** Reasons that block JÓVÁHAGYÁS (besides the dataset's blocking errors). */
export function approvalBlockers(
  p: Product,
  errorCount: number,
  approver: string,
  o: ApprovalOpts = {},
): string[] {
  const out: string[] = [];
  if (errorCount > 0) out.push(`${errorCount} blokkoló hiba`);
  const c = checkerOf(p);
  if (!c) out.push(NO_CHECKER);
  else if (samePerson(c, p.createdBy)) out.push(SAME_PERSON);
  if (o.separateApprover && samePerson(approver, p.createdBy))
    out.push("A készítő nem hagyhatja jóvá a saját termékét.");
  return out;
}

export function approveProduct(p: Product, user: string, at = new Date().toISOString()): Product {
  return {
    ...p,
    status: "approved",
    approvedBy: user,
    approvedAt: at,
    audit: audit(p, user, `Termék jóváhagyva: ${user}`, at),
  };
}

/** VÉGLEGES EXPORT only when approved, reviewed by another person and error-free. */
export function finalExportAllowed(p: Product, errorCount: number) {
  const c = checkerOf(p);
  return (
    p.status === "approved" &&
    errorCount === 0 &&
    !!c &&
    !samePerson(c, p.createdBy) &&
    !!p.approvedBy
  );
}
