// Contracts the data lane shares with the app lanes. name_norm and the account hash are the app's own (app/policy/normalise.ts,
// spine 9.4); this file never forks them. app/policy/normalise.ts landed before the seed froze, so no TEMP copy is kept.
import { createHash } from "node:crypto";
import { accountHash as appAccountHash, nameNorm as appNameNorm } from "../../app/policy/normalise";

export const PAYEE_SEED = 20261027;
export const WORLD_NOW = "2026-10-27T07:00:00Z";
export const ROUTING = "110000000";
export const COMPANY = {
  name: "Halvorsen Mission Systems (fictional)",
  ap_mailbox: "ap@halvorsen-ms.example",
  address: ["1200 Linden Cross Way", "Herndon, VA 20170"],
} as const;

export const sha256Hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
export const accountHash = (account: string, routing: string = ROUTING): string => appAccountHash(routing, account);

export const nameNorm = (input: string): string => appNameNorm(input);

export const isoDate = (iso: string): string => iso.slice(0, 10);
export const addDays = (isoDay: string, days: number): string => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const toE164 = (display: string): string => `+1${display.replace(/\D/g, "").slice(-10)}`;
