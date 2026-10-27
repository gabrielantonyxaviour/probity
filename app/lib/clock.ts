// Injectable clock. Production uses the wall clock; tests pass a fixed one.
export type Clock = { now(): Date };
export const systemClock: Clock = { now: () => new Date() };
export const utcCompact = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
