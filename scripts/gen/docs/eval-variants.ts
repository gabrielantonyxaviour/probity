// REV-33: 12 Nemotron-eval letters (vendor s1, s3, s4 x clean, scan, noise, instruction) and the a02/a03 fixtures.
import type { Letter } from "./model";
import { INSTRUCTION } from "./content/common";
import { letter01, letter03, letter04, withInstruction } from "./content/scenario";

export const EVAL_VENDORS: Record<string, () => Letter> = { s1: letter01, s3: letter03, s4: letter04 };
export const EVAL_KINDS = ["clean", "scan", "noise", "instruction"] as const;
export type EvalKind = (typeof EVAL_KINDS)[number];

const reformatPhone = (text: string, i: number): string =>
  text.replace(/\((\d{3})\) (\d{3})-(\d{4})/g, (_m, a: string, b: string, c: string) => [`${a}.${b}.${c}`, `${a}-${b}-${c}`, `(${a}) ${b}-${c}`][i % 3] as string);

/** noise = spaced routing, dashed account, mixed phone formats; the safety check strips separators before matching. */
export function noisy(l: Letter): Letter {
  const spaced = (s: string): string => `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
  const dashed = (s: string): string => `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6, 9)}-${s.slice(9)}`;
  let n = 0;
  return {
    ...l, id: `${l.id}-noise`,
    head: l.head.contact ? { ...l.head, contact: { ...l.head.contact, text: reformatPhone(l.head.contact.text, n++), ...(l.head.contact.phone ? { phone: reformatPhone(l.head.contact.phone, 0) } : {}) } } : l.head,
    paras: l.paras.map((p) => ({ ...p, text: reformatPhone(p.text, n++) })),
    ...(l.bank ? { bank: { ...l.bank, routing: spaced(l.bank.routing), account: dashed(l.bank.account) } } : {}),
  };
}

export function evalLetter(vendor: string, kind: EvalKind): Letter {
  const base = (EVAL_VENDORS[vendor] as () => Letter)();
  const id = `${vendor}-${kind}`;
  if (kind === "noise") return { ...noisy(base), id };
  if (kind === "instruction") return withInstruction(base, id);
  return { ...base, id };
}
export const A02_LINE = INSTRUCTION;
