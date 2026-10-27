import { randomBytes } from "node:crypto";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
/** r-<YYYYMMDDTHHMMSSZ>-<4hex> (spine §9.1). */
export function makeRunId(d = new Date()): string {
  return `r-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z-${randomBytes(2).toString("hex")}`;
}
