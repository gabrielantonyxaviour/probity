// Reload check (05 2.8): a long-lived API process compares the store file's mtime and size with the values at its
// last load and rebuilds the vendored instance when another process changed the file.
import { statSync } from "node:fs";

export type FileSig = { mtimeMs: number; size: number } | null;

export function fileSignature(file: string): FileSig {
  try {
    const s = statSync(file);
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

export const sigChanged = (a: FileSig, b: FileSig): boolean =>
  (a === null) !== (b === null) || (a !== null && b !== null && (a.mtimeMs !== b.mtimeMs || a.size !== b.size));

export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
