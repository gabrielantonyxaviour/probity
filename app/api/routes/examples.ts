// GET /examples (built from input_examples/*/request.json, input_examples/*.json and the demo inbox items) and
// GET /examples/:example_id/files/:file. Expected decisions are never included: only `input` and `options` of each request.
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../../config/env";
import { DocKind, RunInput } from "../../schemas/api";
import { ExamplesResponse } from "../../schemas/api-routes";
import { EXAMPLE_ID } from "../../schemas/patterns";
import { logger } from "../../trace/logger";
import { exampleDir } from "../resolve-input";
import { readManifest } from "../inbox";
import { fail, parse } from "../error-handler";
import { MIME, checkExampleId, checkFileName, isDir, isFile, safeJoin } from "../paths";

const Params = z.object({ example_id: z.string(), file: z.string() });
const Req = z.object({ input: RunInput, options: z.record(z.string(), z.unknown()).optional() }).passthrough();

function filesOf(dir: string, id: string) {
  const names = readdirSync(dir);
  const out: Array<{ file: string; kind: z.infer<typeof DocKind>; url: string; page_urls?: string[] }> = [];
  for (const f of names.sort()) {
    const ext = path.extname(f).toLowerCase();
    const kind = f.startsWith("headers.") ? "eml_headers" : f.startsWith("letter") ? "letter" : null;
    if (!kind || ![".pdf", ".png", ".jpg", ".jpeg", ".eml", ".txt"].includes(ext)) continue;
    if (kind === "letter" && /-p\d+\.png$/.test(f)) continue; // page images are listed under their PDF
    const stem = f.slice(0, -ext.length);
    const pages = ext === ".pdf" ? names.filter((n) => n === `${stem}.png` || new RegExp(`^${stem}-p\\d+\\.png$`).test(n)).sort() : [];
    out.push({ file: f, kind, url: `/examples/${id}/files/${f}`, ...(pages.length ? { page_urls: pages.map((p) => `/examples/${id}/files/${p}`) } : {}) });
  }
  return out;
}

function buildExamples(cfg: Config) {
  const root = cfg.dirs.examples;
  const found = new Map<string, { id: string; dir: string | null; body: unknown }>();
  if (existsSync(root)) {
    for (const name of readdirSync(root)) {
      const full = path.join(root, name);
      if (isDir(full) && EXAMPLE_ID.test(name) && isFile(path.join(full, "request.json")))
        found.set(name, { id: name, dir: full, body: JSON.parse(readFileSync(path.join(full, "request.json"), "utf8")) });
      else if (name.endsWith(".json") && EXAMPLE_ID.test(name.slice(0, -5)))
        found.set(name.slice(0, -5), { id: name.slice(0, -5), dir: null, body: JSON.parse(readFileSync(full, "utf8")) });
    }
  }
  for (const m of readManifest(cfg)) {
    if (!m.example_id || found.has(m.example_id)) continue;
    const dir = exampleDir(cfg, m.example_id);
    if (dir && isFile(path.join(dir, "request.json"))) found.set(m.example_id, { id: m.example_id, dir, body: JSON.parse(readFileSync(path.join(dir, "request.json"), "utf8")) });
  }
  const examples = [];
  for (const { id, dir, body } of found.values()) {
    const req = Req.safeParse(body);
    if (!req.success) {
      logger.warn({ example_id: id }, "example_request_invalid");
      continue;
    }
    const meta = req.data.input.meta;
    const files = dir ? filesOf(dir, id) : [];
    examples.push({
      example_id: id,
      title: meta?.title ?? id,
      scenario: meta?.scenario ?? null,
      kind: files.length ? ("document" as const) : ("typed" as const),
      received_at: req.data.input.received_at ?? null,
      files,
      request: { input: req.data.input, ...(req.data.options ? { options: req.data.options } : {}) },
    });
  }
  return examples.sort((a, b) => a.example_id.localeCompare(b.example_id));
}

export function registerExamples(app: FastifyInstance): void {
  app.get("/examples", async () => ExamplesResponse.parse({ examples: buildExamples(app.ctx.config) }));

  app.get("/examples/:example_id/files/:file", async (req, reply) => {
    const { example_id, file } = parse(Params, req.params);
    checkExampleId(example_id);
    checkFileName(file);
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) throw fail("not_found", "File not found.");
    const dir = exampleDir(app.ctx.config, example_id);
    if (!dir) throw fail("not_found", "Example not found.");
    const target = safeJoin(dir, file);
    if (!isFile(target)) throw fail("not_found", "File not found.");
    return reply.header("content-type", MIME[ext]!).header("cache-control", "public, max-age=300").send(createReadStream(target));
  });
}
