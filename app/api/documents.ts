// Pre-run document checks (06 §10.1): size limits and magic bytes for inline documents, uploads and example files.
// The orchestrator's documents adapter does the real parsing; this only refuses what must never reach it.
import { openSync, readSync, closeSync, statSync } from "node:fs";
import type { DocKind } from "../schemas/api";
import { fail } from "./error-handler";

export const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8, 0xff],
  pdf: [0x25, 0x50, 0x44, 0x46],
} as const;
export const EML_MAX_BYTES = 64 * 1024;

export const sniff = (head: Uint8Array): "png" | "jpeg" | "pdf" | null => {
  for (const [k, sig] of Object.entries(MAGIC)) if (sig.every((b, i) => head[i] === b)) return k as "png" | "jpeg" | "pdf";
  return null;
};
const looksLikeText = (head: Uint8Array): boolean => !head.includes(0);

/** Throws 415 when the bytes disagree with the declared kind. `head` is the first bytes; `bytes` the full length. */
export function checkKind(kind: DocKind, head: Uint8Array, bytes: number, maxMb: number, name: string): void {
  if (kind === "eml_headers") {
    if (bytes > EML_MAX_BYTES) throw fail("payload_too_large", `${name}: headers are limited to 64 KB.`);
    if (!looksLikeText(head)) throw fail("unsupported_media_type", `${name}: headers must be plain text (.eml or .txt).`);
    return;
  }
  if (bytes > maxMb * 1024 * 1024) throw fail("payload_too_large", `${name}: the limit is ${maxMb} MB.`);
  if (bytes === 0) throw fail("unreadable_document", `${name}: the file is empty.`);
  if (!sniff(head)) throw fail("unsupported_media_type", `${name}: the file is not a PNG, JPEG or PDF.`);
}

export function headOfFile(file: string, n = 16): { head: Uint8Array; bytes: number } {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(n);
    const read = readSync(fd, buf, 0, n, 0);
    return { head: buf.subarray(0, read), bytes: statSync(file).size };
  } finally {
    closeSync(fd);
  }
}

/** Decode inline base64 after checking the decoded length against the limit (no processing of an oversized payload). */
export function decodeInline(b64: string, name: string, maxBytes: number): Buffer {
  const approx = Math.floor((b64.length * 3) / 4);
  if (approx > maxBytes + 4) throw fail("payload_too_large", `${name}: the limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  if (!/^[A-Za-z0-9+/=\s]*$/.test(b64)) throw fail("unreadable_document", `${name}: content_base64 is not valid base64.`);
  return Buffer.from(b64, "base64");
}
