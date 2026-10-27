export type Phase = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9";
export type Job = {
  phase: Phase;
  label: string;
  sql: string;
  key: "query" | "admin";
  kind: "sql" | "ddl";
  limit: number;
  gapBeforeMs?: number;
  file: string;
  /** When set, a real response is written to zetaris/results/<capture>. */
  capture?: string;
};

export const DESCRIBE_RE = /^[A-Za-z0-9 _.,-]+$/;

export function describeBy(text: string): string {
  if (!DESCRIBE_RE.test(text)) throw new Error(`DESCRIBE BY text is not allowed: ${text}`);
  return text;
}
