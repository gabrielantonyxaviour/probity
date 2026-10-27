// lit() (03 §7.2). A value that fails the pattern never reaches SQL.

export const LIT = {
  vendorId: /^V-\d{5}$/,
  requestId: /^BCR-2026-\d{4}$/,
  run: /^PR-\d{4}-\d{2}-\d{2}$/,
  uei: /^[A-Z0-9]{12}$/,
  cik10: /^[0-9]{10}$/,
  state: /^[A-Z]{2}$/,
  hash: /^[0-9a-f]{64}$/,
  invoice: /^INV-[A-Z]{3}-\d{5}$/,
  domain: /^[a-z0-9.-]{1,253}$/,
  nameNorm: /^[A-Z0-9 &/-]{1,120}$/,
  token: /^[A-Z0-9&]{3,40}$/,
  city: /^[A-Z .-]{1,60}$/,
  number: /^\d{1,6}$/,
  session: /^pp_(usa_r|usa_c|sec_s)_[a-z0-9]{10,12}(_pt|_mr)?$/,
} as const;

export function lit(value: string, re: RegExp): string {
  if (!re.test(value)) throw new Error(`lit rejected: ${re.source}`);
  return `'${value.replaceAll("'", "''")}'`;
}

export function ident(value: string, re: RegExp): string {
  if (!re.test(value)) throw new Error(`ident rejected: ${re.source}`);
  return value;
}
