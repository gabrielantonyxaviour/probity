// Building a POST /run body from CLI flags or a request file (06 §5). File references beside the JSON are read from the
// JSON file's directory and sent as DocInline; an example that the server can resolve itself keeps its file references.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RunRequest } from "../schemas/api";
import { FILE_NAME } from "../schemas/patterns";

/** The only part of the config the input builder needs. */
export type ExamplesCfg = { dirs: { examples: string } };

export class CliInputError extends Error {
  readonly code = "invalid_input";
}

export type RunFlags = {
  input?: string | undefined;
  example?: string | undefined;
  name?: string | undefined;
  uei?: string | undefined;
  cik?: string | undefined;
  "claim-remit"?: string | undefined;
  "claim-routing"?: string | undefined;
  "claim-account"?: string | undefined;
  "claim-email"?: string | undefined;
  "payment-run"?: string | undefined;
  "received-at"?: string | undefined;
  "simulate-outage"?: string | undefined;
  budget?: string | undefined;
  sample?: boolean | undefined;
};

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new CliInputError(`${file}: not a readable JSON file.`);
  }
}

/** `--input <file|dir>`: a directory reads `<dir>/request.json`. Returns the parsed body and the directory the file lives in. */
export function readRequestFile(p: string): { body: unknown; dir: string } {
  if (!existsSync(p)) throw new CliInputError(`${p}: no such file or directory.`);
  const file = statSync(p).isDirectory() ? path.join(p, "request.json") : p;
  if (!existsSync(file)) throw new CliInputError(`${file}: not found.`);
  return { body: readJson(file), dir: path.dirname(path.resolve(file)) };
}

/** Accept a full POST /run body, or a bare input object. */
function asBody(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && "input" in raw) return raw as Record<string, unknown>;
  return { input: raw, options: {} };
}

/** "<line1>, <city>, <ST> <zip>" */
export function parseRemit(s: string): { line1: string; city: string; state: string; zip?: string } {
  const m = s.match(/^\s*(.+?)\s*,\s*(.+?)\s*,\s*([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$/);
  if (!m) throw new CliInputError('--claim-remit: expected "<line1>, <city>, <ST> <zip>".');
  return { line1: m[1]!, city: m[2]!, state: m[3]!.toUpperCase(), ...(m[4] ? { zip: m[4] } : {}) };
}

function typedFromFlags(f: RunFlags): Record<string, unknown> {
  const vendor = {
    ...(f.name ? { legal_name: f.name } : {}),
    ...(f.uei ? { uei: f.uei } : {}),
    ...(f.cik ? { cik: f.cik } : {}),
  };
  const bank = f["claim-routing"] || f["claim-account"] ? { routing: f["claim-routing"], account_number: f["claim-account"] } : undefined;
  const claims = {
    ...(f.name ? { claimed_name: f.name } : {}),
    ...(f["claim-remit"] ? { remit_address: parseRemit(f["claim-remit"]) } : {}),
    ...(bank ? { bank } : {}),
    ...(f["claim-email"] ? { sender_email: f["claim-email"] } : {}),
  };
  const hasClaims = Object.keys(claims).filter((k) => k !== "claimed_name").length > 0;
  return { vendor, ...(hasClaims ? { claims } : {}) };
}

/** Convert `{kind, file}` references to inline base64 documents read from `dir`, unless the server resolves them itself. */
export function inlineDocs(input: Record<string, unknown>, dir: string, cfg: ExamplesCfg): Record<string, unknown> {
  const docs = input.documents;
  if (!Array.isArray(docs)) return input;
  const exampleId = typeof input.example_id === "string" ? input.example_id : null;
  if (exampleId && path.resolve(cfg.dirs.examples, exampleId) === dir) return input; // the server reads them from the same place
  const out = docs.map((d) => {
    const ref = d as { kind?: string; file?: string };
    if (!ref.file) return d;
    if (!FILE_NAME.test(ref.file)) throw new CliInputError(`${ref.file}: not a plain file name.`);
    const full = path.resolve(dir, ref.file);
    if (!full.startsWith(dir + path.sep) || !existsSync(full)) throw new CliInputError(`${ref.file}: not found beside the request file.`);
    return { kind: ref.kind, filename: ref.file, content_base64: readFileSync(full).toString("base64") };
  });
  return { ...input, documents: out };
}

export function buildRunBody(f: RunFlags, cfg: ExamplesCfg): { body: z.infer<typeof RunRequest>; dir: string | null } {
  const modes = [f.input, f.example, f.name || f.uei || f.cik].filter(Boolean).length;
  if (modes !== 1) throw new CliInputError("run: give exactly one of --input, --example, or --name/--uei/--cik.");
  let raw: Record<string, unknown>;
  let dir: string | null = null;
  if (f.input) {
    const r = readRequestFile(f.input);
    raw = asBody(r.body);
    dir = r.dir;
  } else if (f.example) {
    const exDir = path.join(cfg.dirs.examples, f.example);
    const file = existsSync(path.join(exDir, "request.json")) ? exDir : path.join(cfg.dirs.examples, `${f.example}.json`);
    if (existsSync(file)) {
      const r = readRequestFile(file);
      raw = asBody(r.body);
      dir = r.dir;
    } else raw = { input: { example_id: f.example }, options: {} };
  } else raw = { input: typedFromFlags(f), options: {} };

  const input = { ...(raw.input as Record<string, unknown>) };
  if (f["payment-run"]) input.payment_run_id = f["payment-run"];
  if (f["received-at"]) input.received_at = f["received-at"];
  const options = { ...((raw.options as Record<string, unknown> | undefined) ?? {}) };
  if (f["simulate-outage"]) options.simulate_outage = f["simulate-outage"].split(",").map((s) => s.trim());
  if (f.budget) options.budget_seconds = Number(f.budget);
  if (f.sample) options.sample_mode = true;
  const resolved = dir ? inlineDocs(input, dir, cfg) : input;
  const parsed = RunRequest.safeParse({ ...(raw as object), input: resolved, options });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new CliInputError(i ? `${i.path.join(".")}: ${i.message}` : "The input is not valid.");
  }
  return { body: parsed.data, dir };
}
