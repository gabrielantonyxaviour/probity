import type { FactField, ReasonCode, ReasonCodeId } from "../schemas/decision";
import { tidy } from "./normalise";

export const CODE_CLASS: Record<ReasonCodeId, ReasonCode["class"]> = {
  R1: "red", R2: "red", R3: "red", R4: "red", R5: "red", R6: "red", R7: "red",
  C1: "cap", C2: "cap", C3: "cap", C4: "cap", C5: "cap", C6: "cap",
  I1: "info", I2: "info", I3: "info", I4: "info", I5: "info", I6: "info",
};

export function mk(
  code: ReasonCodeId,
  detail: string,
  evidence_ids: string[] = [],
  extra: Partial<Pick<ReasonCode, "annotation" | "variant">> = {},
): ReasonCode {
  return { code, class: CODE_CLASS[code], detail: tidy(detail), evidence_ids: [...new Set(evidence_ids)], ...extra };
}

/** Sort red -> cap -> info, then by code number. */
export function sortCodes(codes: ReasonCode[]): ReasonCode[] {
  const rank = { red: 0, cap: 1, info: 2 } as const;
  return [...codes].sort((a, b) => rank[a.class] - rank[b.class] || Number(a.code.slice(1)) - Number(b.code.slice(1)));
}

/** Fact-sheet fields each code cites (decisive fields, 04 §8.2). */
export const CODE_FIELDS: Partial<Record<ReasonCodeId, FactField[]>> = {
  R1: ["sender_domain"],
  R2: ["remit_address"],
  R3: ["remit_address"],
  R4: ["legal_name"],
  R6: ["bank_account"],
  R7: ["bank_account"],
  C1: ["callback_phone"],
  C3: ["legal_name"],
  C5: ["callback_phone"],
  C6: ["legal_name"],
};

export const SOURCE_LABEL = { vendor_master: "Vendor master", usaspending: "USAspending", edgar: "SEC EDGAR", request: "The request" } as const;
