// Builds every generated document output in memory: example folders, inbox items, typed examples, sidecars, truth files, manifest, fixtures.
import path from "node:path";
import sharp from "sharp";
import { sha256Hex, PAYEE_SEED } from "../contracts";
import { buildEml, parseEml, type EmlSpec } from "./eml";
import { degrade } from "./degrade";
import type { ExampleDoc } from "./example";
import { A02_LINE, EVAL_KINDS, EVAL_VENDORS, evalLetter, type EvalKind } from "./eval-variants";
import { layoutLetter } from "./layout";
import type { Laid, Letter } from "./model";
import { letterPdf, scanPdf } from "./render-pdf";
import { pageToPng } from "./render-svg";
import { checkEml, checkLetter, failOnErrors } from "./safety";
import { buildClaims, buildTruth } from "./sidecar";
import { SeedView } from "./seed-view";
import { buildInbox } from "./content/inbox-build";
import { INBOX_1 } from "./content/inbox-1";
import { INBOX_2 } from "./content/inbox-2";
import { scenarioExamples, TYPED_EXAMPLES } from "./content/examples";
import { letter03, withInstruction } from "./content/scenario";

export type Files = Map<string, Buffer | string>;
const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
const MEDIA: Record<string, string> = { "letter.png": "image/png", "letter.pdf": "application/pdf", "headers.eml": "message/rfc822" };

export interface Rendered { laid: Laid; png: Buffer; pdf: Buffer; emlText: string | null }
export async function render(l: Letter, opts: { scan?: boolean; eml?: EmlSpec | undefined }): Promise<Rendered> {
  const laid = layoutLetter(l);
  const errs = checkLetter(l, laid);
  const emlText = opts.eml ? buildEml(opts.eml) : null;
  if (emlText) errs.push(...checkEml(emlText, l.company, l.id));
  failOnErrors(errs);
  const base = await pageToPng(laid.pages[0] as never, l.company);
  if (opts.scan) {
    const scan = await degrade(base);
    return { laid, png: scan.png, pdf: await scanPdf(scan.jpg, l.company), emlText };
  }
  return { laid, png: base, pdf: await letterPdf(laid.pages, l.company), emlText };
}

function requestJson(d: ExampleDoc): string {
  const docs = [{ kind: "letter", file: "letter.pdf" }, ...(d.eml ? [{ kind: "eml_headers", file: "headers.eml" }] : [])];
  return json({ input: { example_id: d.exampleId, request_id: d.requestId, documents: docs, received_at: d.receivedAt, channel: d.channel, payment_run_id: d.paymentRunId, meta: { title: d.title, ...(d.scenario ? { scenario: d.scenario } : {}) } }, options: {} });
}

export interface BuildOptions { only?: string[]; evalVariants?: boolean }

export async function buildDocuments(opts: BuildOptions = {}): Promise<Files> {
  const files: Files = new Map();
  const seed = new SeedView();
  const inbox = [...INBOX_1, ...INBOX_2].map((s, i) => buildInbox(s, seed, i));
  const examples = [...scenarioExamples(), ...inbox];
  const items: unknown[] = [];
  const selected = (d: ExampleDoc): boolean => !opts.only || opts.only.some((o) => d.exampleId.startsWith(o) || d.requestId.endsWith(o));
  for (const d of examples.filter(selected)) {
    const r = await render(d.letter, { scan: d.scan ?? false, eml: d.eml });
    const out = (name: string, content: Buffer | string): void => { files.set(path.posix.join(d.folder, name), content); };
    out("letter.png", r.png);
    out("letter.pdf", r.pdf);
    if (r.emlText) out("headers.eml", r.emlText);
    out("request.json", requestJson(d));
    const attachments = ["letter.png", "letter.pdf", ...(r.emlText ? ["headers.eml"] : [])].map((f) => ({ kind: f === "headers.eml" ? "eml_headers" : "letter", file: f, media_type: MEDIA[f], sha256: sha256Hex(f === "letter.png" ? r.png : f === "letter.pdf" ? r.pdf : (r.emlText as string)) }));
    const eml = r.emlText ? parseEml(r.emlText) : null;
    files.set(`data/sample/claims/${d.exampleId}.claims.json`, json(buildClaims(d.letter, r.laid, eml, attachments.map((a) => a.sha256), d.exampleId)));
    files.set(`tests/fixtures/docs/${d.exampleId}.truth.json`, json(buildTruth(d.letter, r.laid, d.exampleId, eml)));
    items.push({
      inbox_id: `IN-${d.requestId.slice(-4)}`, request_id: d.requestId, example_id: d.exampleId, claimed_name: d.manifestName, change_kinds: d.kinds, payment_run_id: d.paymentRunId,
      received_at: d.receivedAt, channel: d.channel, from: d.from, subject: d.subject, scenario: d.scenario, dir: d.folder, attachments,
    });
  }
  if (!opts.only) {
    for (const [name, body] of Object.entries(TYPED_EXAMPLES)) files.set(`input_examples/${name}`, json(body));
    (items as { received_at: string; request_id: string }[]).sort((a, b) => a.received_at.localeCompare(b.received_at) || a.request_id.localeCompare(b.request_id));
    files.set("data/inbox/manifest.json", json({ synthetic: true, generated_by: "scripts/make_documents.ts", seed: PAYEE_SEED, items }));
    await addFixtures(files);
  }
  if (opts.evalVariants) await addEvalVariants(files);
  return files;
}

/** a02: the S3 letter with an embedded instruction. a03: the S3 letter whose .eml Reply-To is another domain (REV-44). */
async function addFixtures(files: Files): Promise<void> {
  const base = scenarioExamples().find((e) => e.exampleId === "03-l3harris-bank-change") as ExampleDoc;
  for (const [id, variant] of [["a02", "instruction"], ["a03", "reply-to"]] as const) {
    const letter = variant === "instruction" ? withInstruction(letter03(), id) : { ...letter03(), id };
    const eml: EmlSpec = { ...(base.eml as EmlSpec), ...(variant === "reply-to" ? { replyTo: "treasury@l3harris-remit.example" } : {}) };
    const r = await render(letter, { eml });
    const dir = `tests/eval/fixtures/${id}`;
    files.set(`${dir}/letter.pdf`, r.pdf);
    files.set(`${dir}/letter.png`, r.png);
    files.set(`${dir}/headers.eml`, r.emlText as string);
    const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64");
    files.set(`${dir}/request.json`, json({
      input: { documents: [{ kind: "letter", filename: "letter.pdf", content_base64: b64(r.pdf) }, { kind: "eml_headers", filename: "headers.eml", content_base64: b64(r.emlText as string) }], received_at: base.receivedAt, channel: "email", payment_run_id: "PR-2026-10-30", meta: { title: `${id}: ${variant === "instruction" ? "embedded instruction" : "Reply-To on another domain"}` } },
      options: {},
    }));
    files.set(`${dir}/${id}.claims.json`, json(buildClaims(letter, r.laid, parseEml(r.emlText as string), [sha256Hex(r.png), sha256Hex(r.pdf), sha256Hex(r.emlText as string)], id)));
  }
  void A02_LINE;
}

async function addEvalVariants(files: Files): Promise<void> {
  for (const vendor of Object.keys(EVAL_VENDORS)) {
    for (const kind of EVAL_KINDS as readonly EvalKind[]) {
      const letter = evalLetter(vendor, kind);
      const r = await render(letter, { scan: kind === "scan" });
      const dir = `tests/eval/nemotron/letters/${vendor}-${kind}`;
      files.set(`${dir}/letter.pdf`, r.pdf);
      files.set(`${dir}/letter.png`, r.png);
      files.set(`${dir}/truth.json`, json(buildTruth(letter, r.laid, `${vendor}-${kind}`, null)));
    }
  }
}

export async function pngSize(b: Buffer): Promise<[number, number]> {
  const m = await sharp(b).metadata();
  return [m.width ?? 0, m.height ?? 0];
}
