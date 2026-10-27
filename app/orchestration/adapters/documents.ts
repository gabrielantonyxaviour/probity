// Documents adapter (06 §4.2, 04 §2.2): resolves a RunInput's documents into hashes, PDF paths, page PNGs and header text.
// Gap-fill for app/adapters/documents.ts (the integrator adds a one-line facade): no lane brief assigned the file.
// Only names inside INPUT_EXAMPLES_DIR/<id>/ or UPLOAD_DIR/<id>/ are ever read; inline documents go to a private temp dir.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { DocKind, DocPage, RunInput } from "../../schemas/api";
import { AppError } from "../../schemas/errors";
import type { Channel } from "../../schemas/erp";
import type { DocumentsPort, ResolvedDoc, ResolvedInput } from "../../agents/letter-reader/docs.port";

const run = promisify(execFile);
const EXEC = { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 } as const;
type Dirs = { examples: string; uploads: string };
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const media = (f: string, head: Buffer): ResolvedDoc["media_type"] =>
  head.subarray(0, 4).toString("latin1") === "%PDF" ? "application/pdf" : head[0] === 0x89 && head[1] === 0x50 ? "image/png" : /\.(eml|txt)$/i.test(f) ? "message/rfc822" : "image/png";

function exampleDir(dirs: Dirs, id: string): string | null {
  const direct = path.resolve(dirs.examples, id);
  if (direct.startsWith(path.resolve(dirs.examples) + path.sep) && existsSync(direct)) return direct;
  try {
    const mf = path.resolve(dirs.examples, "..", "data", "inbox", "manifest.json");
    const items = (JSON.parse(readFileSync(mf, "utf8")) as { items?: Array<{ example_id?: string | null; dir?: string }> }).items ?? [];
    const hit = items.find((i) => i.example_id === id && i.dir);
    const dir = hit?.dir ? path.resolve(dirs.examples, "..", hit.dir) : null;
    return dir && existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

async function renderPages(pdf: string, outDir: string): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  await run("pdftoppm", ["-png", "-r", "144", "-scale-to", "1600", "-l", "4", pdf, path.join(outDir, "page")], EXEC);
  return readdirSync(outDir).filter((f) => /^page-\d+\.png$/.test(f)).sort().map((f) => path.join(outDir, f));
}

async function pngSize(file: string): Promise<{ width: number; height: number }> {
  const m = await sharp(file).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

export function createDocuments(cfg: { dirs: Dirs }): DocumentsPort {
  return {
    async resolve(input: RunInput): Promise<ResolvedInput> {
      let dir: string;
      let urlBase: string;
      let list: Array<{ kind: DocKind; file: string }> = [];
      const tmp = path.join(os.tmpdir(), `probity-docs-${randomBytes(4).toString("hex")}`);
      if (input.upload_id) {
        dir = path.resolve(cfg.dirs.uploads, input.upload_id);
        urlBase = `/uploads/${input.upload_id}/files`;
        const mf = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as { documents: Array<{ kind: DocKind; filename: string }> };
        list = mf.documents.map((d) => ({ kind: d.kind, file: d.filename }));
      } else if (input.example_id) {
        const ed = exampleDir(cfg.dirs, input.example_id);
        if (!ed) throw new AppError("not_found", "Example not found.", { httpStatus: 404 });
        dir = ed;
        urlBase = `/examples/${input.example_id}/files`;
        list = (input.documents ?? []).flatMap((d) => ("file" in d ? [{ kind: d.kind, file: d.file }] : []));
      } else {
        dir = tmp;
        urlBase = "";
        mkdirSync(tmp, { recursive: true });
      }
      for (const d of input.documents ?? []) {
        if (!("content_base64" in d)) continue;
        mkdirSync(tmp, { recursive: true });
        writeFileSync(path.join(tmp, d.filename), Buffer.from(d.content_base64, "base64"));
        list.push({ kind: d.kind, file: d.filename });
      }
      const docs: ResolvedDoc[] = [];
      const pages: DocPage[] = [];
      let eml: string | null = null;
      for (const [i, d] of list.entries()) {
        const file = existsSync(path.join(dir, d.file)) ? path.join(dir, d.file) : path.join(tmp, d.file);
        const buf = readFileSync(file);
        const mt = d.kind === "eml_headers" ? "message/rfc822" : media(d.file, buf);
        const base: ResolvedDoc = { doc_index: i + 1, kind: d.kind, filename: d.file, media_type: mt, sha256: sha(buf), page_count: 1 };
        if (d.kind === "eml_headers") {
          eml = buf.subarray(0, 64 * 1024).toString("utf8");
          docs.push(base);
          continue;
        }
        let pngs: string[];
        if (mt === "application/pdf") {
          base.pdf_path = file;
          const stem = d.file.replace(/\.pdf$/i, "");
          const sibling = [path.join(dir, `${stem}.png`)].filter(existsSync);
          const paged = readdirSync(path.dirname(file)).filter((f) => new RegExp(`^${stem}-p\\d+\\.png$`).test(f)).sort((a, b) => Number(/p(\d+)/.exec(a)![1]) - Number(/p(\d+)/.exec(b)![1])).map((f) => path.join(path.dirname(file), f));
          pngs = paged.length ? paged : sibling.length ? sibling : await renderPages(file, path.join(tmp, `render-${i + 1}`)).catch(() => []);
        } else pngs = [file];
        base.png_paths = pngs;
        base.page_count = Math.max(1, Math.min(4, pngs.length || 1));
        docs.push(base);
        for (const [n, png] of pngs.slice(0, 4).entries()) {
          const size = await pngSize(png).catch(() => ({ width: 0, height: 0 }));
          pages.push({ doc_index: i + 1, kind: d.kind, page: n + 1, url: urlBase ? `${urlBase}/${path.basename(png)}` : "", width: size.width, height: size.height });
        }
      }
      const channel: Channel = input.channel ?? (eml ? "email" : docs.length ? "mail" : "typed");
      return { docs, eml_headers: eml, example_id: input.example_id ?? null, channel, doc_pages: pages };
    },
  };
}
