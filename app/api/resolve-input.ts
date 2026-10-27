// POST /run input resolution (06 §4.2). The API never accepts filesystem paths: example files are names resolved only
// inside INPUT_EXAMPLES_DIR/<example_id>/ (or a manifest item's data/inbox directory), uploads only inside UPLOAD_DIR.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config/env";
import type { RunRecord } from "../runtime/run-record";
import type { RunRegistry } from "../runtime/run-registry";
import type { DocKind, RunInput } from "../schemas/api";
import { fail } from "./error-handler";
import { checkKind, decodeInline, headOfFile } from "./documents";
import { checkExampleId, checkUploadId, isDir, isFile, isInside, safeJoin } from "./paths";

export type Resolved = { input: RunInput; input_ref: RunRecord["input_ref"] };

/** The directory holding an example's files: input_examples/<id>, else a data/inbox manifest item with that example_id. */
export function exampleDir(cfg: Pick<Config, "dirs">, id: string): string | null {
  checkExampleId(id);
  const direct = path.resolve(cfg.dirs.examples, id);
  if (isInside(cfg.dirs.examples, direct) && isDir(direct)) return direct;
  const manifest = path.resolve(cfg.dirs.examples, "..", "data", "inbox", "manifest.json");
  try {
    if (!existsSync(manifest)) return null;
    const items = (JSON.parse(readFileSync(manifest, "utf8")) as { items?: Array<{ example_id?: string | null; dir?: string }> }).items ?? [];
    const hit = items.find((i) => i.example_id === id && typeof i.dir === "string");
    if (!hit?.dir) return null;
    const dataInbox = path.resolve(cfg.dirs.examples, "..", "data", "inbox");
    const dir = path.resolve(cfg.dirs.examples, "..", hit.dir);
    return isInside(dataInbox, dir) && isDir(dir) ? dir : null;
  } catch {
    return null;
  }
}

function checkExampleFiles(cfg: Config, dir: string, docs: Array<{ kind: DocKind; file: string }>): void {
  for (const d of docs) {
    const file = safeJoin(dir, d.file);
    if (!isFile(file)) throw fail("not_found", `Example file not found: ${d.file}.`);
    const { head, bytes } = headOfFile(file);
    checkKind(d.kind, head, bytes, cfg.MAX_UPLOAD_MB, d.file);
  }
}

export function resolveInput(cfg: Config, registry: Pick<RunRegistry, "get">, input: RunInput): Resolved {
  const typed = !!(input.vendor || input.claims);
  if (input.reevaluate) {
    const from = registry.get(input.reevaluate.from_run_id);
    if (!from) throw fail("not_found", "The run to re-evaluate was not found.");
    return { input, input_ref: { kind: "reevaluate", request_id: input.reevaluate.request_id } };
  }
  if (input.upload_id) {
    checkUploadId(input.upload_id);
    if (!isDir(path.join(cfg.dirs.uploads, input.upload_id))) throw fail("not_found", "Upload expired; upload again.");
    return { input, input_ref: { kind: "upload", upload_id: input.upload_id, ...(input.request_id ? { request_id: input.request_id } : {}) } };
  }
  if (input.example_id) {
    const dir = exampleDir(cfg, input.example_id);
    if (!dir) {
      if (!typed) throw fail("not_found", "Example not found.");
    } else {
      let docs = input.documents;
      if (!docs?.length) {
        const defaults: Array<{ kind: DocKind; file: string }> = [];
        const letter = ["letter.pdf", "letter.png"].find((f) => isFile(path.join(dir, f)));
        if (letter) defaults.push({ kind: "letter", file: letter });
        if (isFile(path.join(dir, "headers.eml"))) defaults.push({ kind: "eml_headers", file: "headers.eml" });
        if (!defaults.length && !typed) throw fail("not_found", "The example has no documents.");
        docs = defaults;
      }
      checkExampleFiles(cfg, dir, docs.filter((d): d is { kind: DocKind; file: string } => "file" in d));
      input = { ...input, documents: docs };
    }
    return { input, input_ref: { kind: "example", example_id: input.example_id, ...(input.request_id ? { request_id: input.request_id } : {}) } };
  }
  for (const d of input.documents ?? []) {
    if (!("content_base64" in d)) continue;
    const max = d.kind === "eml_headers" ? 64 * 1024 : cfg.MAX_UPLOAD_MB * 1024 * 1024;
    const buf = decodeInline(d.content_base64, d.filename, max);
    checkKind(d.kind, buf.subarray(0, 16), buf.length, cfg.MAX_UPLOAD_MB, d.filename);
  }
  return { input, input_ref: { kind: "typed", ...(input.request_id ? { request_id: input.request_id } : {}) } };
}
