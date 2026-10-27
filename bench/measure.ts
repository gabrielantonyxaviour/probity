// Helpers for bench/direct-fetch.ts: line counts (non-blank, non-comment) and timing summaries.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");

/** cloc-style count: lines that are neither blank nor a pure comment (`--`, `//`, `#`, or a block-comment line). */
export function codeLines(file: string): number {
  let inBlock = false;
  let n = 0;
  for (const raw of readFileSync(path.join(ROOT, file), "utf8").split("\n")) {
    const l = raw.trim();
    if (inBlock) {
      if (l.includes("*/")) inBlock = false;
      continue;
    }
    if (!l || l.startsWith("--") || l.startsWith("//") || l.startsWith("#")) continue;
    if (l.startsWith("/*")) {
      if (!l.includes("*/")) inBlock = true;
      continue;
    }
    n += 1;
  }
  return n;
}

export const filesIn = (dir: string, ext: string): string[] => readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export const count = (re: RegExp, text: string): number => (text.match(re) ?? []).length;
