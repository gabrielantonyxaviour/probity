// data/generated-manifest.json: sha256 and bytes for every generated output, plus the real-named and fictional vendor counts (REV-65).
// gen:seed owns the "seed" section and gen:docs owns "documents"; each generator rewrites only its own section.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PAYEE_SEED, sha256Hex, WORLD_NOW } from "./contracts";

export interface OutputEntry { path: string; sha256: string; bytes: number }
export interface Manifest {
  synthetic: true;
  seed: number;
  world_now: string;
  real_named?: number;
  fictional?: number;
  rows?: Record<string, number>;
  outputs: { seed?: OutputEntry[]; documents?: OutputEntry[] };
}
export const ROOT = path.resolve(import.meta.dirname, "../..");
export const MANIFEST_PATH = path.join(ROOT, "data/generated-manifest.json");

export function entryFor(rel: string, content: string | Uint8Array): OutputEntry {
  return { path: rel, sha256: sha256Hex(content), bytes: typeof content === "string" ? Buffer.byteLength(content) : content.length };
}
export function readManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return { synthetic: true, seed: PAYEE_SEED, world_now: WORLD_NOW, outputs: {} };
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}
export function writeManifest(m: Manifest): void {
  mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(m, null, 2)}\n`);
}
