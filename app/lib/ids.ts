// Run and trace ids (06 §4.2): r-<UTCcompact>-<hex4>, t-<hex8>.
import { randomBytes } from "node:crypto";
import { utcCompact } from "./clock";

export const newRunId = (now: Date = new Date()): string => `r-${utcCompact(now)}-${randomBytes(2).toString("hex")}`;
export const newTraceId = (): string => `t-${randomBytes(4).toString("hex")}`;
export const newUploadId = (): string => `up-${randomBytes(6).toString("hex")}`;
