// Upload processing (06 §4.5, §10.1): magic bytes, sharp probe (limitInputPixels 40 MP, each side <= 6000 px), downscale to
// <= 1600 px, pdftoppm / pdftotext through execFile (no shell, 20 s timeout, first 4 pages). Files land in UPLOAD_DIR/<id>/.
import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { sha256 } from "../lib/hash";
import type { z } from "zod";
import type { UploadedDocument } from "../schemas/api-routes";
import { fail } from "./error-handler";
import { sniff } from "./documents";
import { parseEmlHeaders } from "./eml";

const run = promisify(execFile);
export type UploadDoc = z.infer<typeof UploadedDocument>;
const MAX_SIDE = 6000;
const MAX_PIXELS = 40_000_000;
const EXEC = { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 } as const;

async function toPagePng(input: Buffer, file: string): Promise<void> {
  try {
    const img = sharp(input, { limitInputPixels: MAX_PIXELS });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width > MAX_SIDE || meta.height > MAX_SIDE)
      throw fail("unreadable_document", "The image is larger than 6000 px on a side.");
    await img.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toFile(file);
  } catch (err) {
    if (err && typeof err === "object" && "httpStatus" in err) throw err;
    throw fail("unreadable_document", "The image could not be read.");
  }
}

async function pdfPages(pdf: string, dir: string): Promise<{ pages: number; text_layer: boolean }> {
  try {
    await run("pdftoppm", ["-png", "-r", "144", "-scale-to", "1600", "-l", "4", pdf, path.join(dir, "letter-p")], EXEC);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw fail("pdf_render_unavailable", "PDF rendering is unavailable on this host; upload a PNG.");
    throw fail("unreadable_document", "The PDF could not be read.");
  }
  // pdftoppm names pages letter-p-1.png or letter-p-01.png; normalise to letter-p<n>.png
  const rendered = readdirSync(dir).filter((f) => /^letter-p-\d+\.png$/.test(f)).sort();
  rendered.forEach((f, i) => renameSync(path.join(dir, f), path.join(dir, `letter-p${i + 1}.png`)));
  const text_layer = await run("pdftotext", ["-l", "4", pdf, "-"], EXEC)
    .then(({ stdout }) => stdout.replace(/\s+/g, "").length >= 80)
    .catch(() => false);
  return { pages: Math.max(1, Math.min(4, rendered.length)), text_layer };
}
export type UploadInput = { letter: { filename: string; data: Buffer }; headers?: { filename: string; data: Buffer } };

export async function processUpload(dir: string, id: string, input: UploadInput): Promise<UploadDoc[]> {
  mkdirSync(dir, { recursive: true });
  const docs: UploadDoc[] = [];
  const kind = sniff(input.letter.data.subarray(0, 16));
  if (!kind) throw fail("unsupported_media_type", "The letter must be a PNG, JPEG or PDF.");
  const base = `/uploads/${id}/files`;
  if (kind === "pdf") {
    const pdf = path.join(dir, "letter.pdf");
    writeFileSync(pdf, input.letter.data);
    const { pages, text_layer } = await pdfPages(pdf, dir);
    docs.push({
      doc_index: 1, kind: "letter", filename: "letter.pdf", mime: "application/pdf", bytes: input.letter.data.length,
      pages, sha256: sha256(input.letter.data), text_layer,
      page_urls: Array.from({ length: pages }, (_v, i) => `${base}/letter-p${i + 1}.png`),
    });
  } else {
    writeFileSync(path.join(dir, `letter.${kind === "png" ? "png" : "jpg"}`), input.letter.data);
    await toPagePng(input.letter.data, path.join(dir, "letter-p1.png"));
    docs.push({
      doc_index: 1, kind: "letter", filename: `letter.${kind === "png" ? "png" : "jpg"}`, mime: kind === "png" ? "image/png" : "image/jpeg",
      bytes: input.letter.data.length, pages: 1, sha256: sha256(input.letter.data), text_layer: false, page_urls: [`${base}/letter-p1.png`],
    });
  }
  if (input.headers) {
    if (input.headers.data.length > 64 * 1024) throw fail("payload_too_large", "Headers are limited to 64 KB.");
    if (input.headers.data.includes(0)) throw fail("unsupported_media_type", "Headers must be plain text (.eml or .txt).");
    writeFileSync(path.join(dir, "headers.eml"), input.headers.data);
    docs.push({
      doc_index: 2, kind: "eml_headers", filename: "headers.eml", mime: "message/rfc822", bytes: input.headers.data.length,
      sha256: sha256(input.headers.data), headers: parseEmlHeaders(input.headers.data),
    });
  }
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ upload_id: id, documents: docs }, null, 2));
  return docs;
}

/** Delete upload directories older than 24 h (boot and hourly). Returns the ids removed. */
export function sweepUploads(root: string, maxAgeMs = 24 * 3600 * 1000): string[] {
  const removed: string[] = [];
  try {
    for (const name of readdirSync(root)) {
      if (!/^up-[0-9a-f]{12}$/.test(name)) continue;
      const p = path.join(root, name);
      if (Date.now() - statSync(p).mtimeMs > maxAgeMs) {
        rmSync(p, { recursive: true, force: true });
        removed.push(name);
      }
    }
  } catch {
    /* no uploads directory yet */
  }
  return removed;
}
