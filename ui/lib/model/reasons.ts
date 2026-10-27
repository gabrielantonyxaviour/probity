// Why groups for the Decision card (01 section 17.2): red, then cap, then info, in the UI display order.
import type { ReasonCode } from "../contracts";
import { REASON_ORDER, type ReasonClass } from "../labels";

export function groupReasons(codes: ReasonCode[]): Record<ReasonClass, ReasonCode[]> {
  const out: Record<ReasonClass, ReasonCode[]> = { red: [], cap: [], info: [] };
  for (const cls of ["red", "cap", "info"] as const) {
    const order = REASON_ORDER[cls];
    out[cls] = codes
      .filter((c) => c.class === cls)
      .sort((a, b) => {
        const ia = order.indexOf(a.code);
        const ib = order.indexOf(b.code);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
  }
  return out;
}

export function hasLookalike(codes: ReasonCode[], graphFlags: string[] = []): boolean {
  const r1 = codes.find((c) => c.code === "R1");
  return !!r1 && (/lookalike/i.test(r1.detail) || graphFlags.includes("lookalike"));
}
