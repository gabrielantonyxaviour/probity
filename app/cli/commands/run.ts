// probity run (06 §5). Exactly one of --input, --example, --name/--uei/--cik. If {api}/healthz answers, the run is forwarded
// (async + follow) so the terminal and the UI show the same run; otherwise it runs in-process. Output order: trace lines,
// the three [INFO] lines, the 01 §11.7 summary block. SAMPLE prints its banner first and last. --json prints only the envelope.
import { parseArgs } from "node:util";
import { AppError } from "../../schemas/errors";
import type { RunEnvelope, RunErrorEnvelope } from "../../schemas/api";
import { apiAlive, followRun } from "../remote";
import { EXIT, apiBase, err, exitForHttp, loadConfigOrExit, openLocal, out } from "../context";
import { CliInputError, buildRunBody, type RunFlags } from "../input-file";
import { SAMPLE_BANNER, exitCodeFor, renderResult } from "../print";
import { saveExample } from "../save-example";

export const RUN_OPTIONS = {
  input: { type: "string" },
  example: { type: "string" },
  name: { type: "string" },
  uei: { type: "string" },
  cik: { type: "string" },
  "claim-remit": { type: "string" },
  "claim-routing": { type: "string" },
  "claim-account": { type: "string" },
  "claim-email": { type: "string" },
  "payment-run": { type: "string" },
  "received-at": { type: "string" },
  "request-id": { type: "string" },
  "simulate-outage": { type: "string" },
  sample: { type: "boolean" },
  json: { type: "boolean" },
  api: { type: "string" },
  local: { type: "boolean" },
  "save-example": { type: "string" },
  budget: { type: "string" },
} as const;

export async function runCommand(argv: string[]): Promise<number> {
  let values: RunFlags & { json?: boolean; api?: string; local?: boolean; "save-example"?: string };
  try {
    values = parseArgs({ args: argv, options: RUN_OPTIONS, allowPositionals: false }).values as typeof values;
  } catch (e) {
    err(`[ERROR] ${(e as Error).message}`);
    return EXIT.invalid;
  }
  if (values.sample) process.env.SAMPLE_MODE = "true";
  const cfg = loadConfigOrExit();
  if (!cfg) return EXIT.error;
  let body;
  try {
    body = buildRunBody(values, cfg).body;
  } catch (e) {
    err(`[ERROR] ${e instanceof CliInputError ? e.message : "The input is not valid."}`);
    return EXIT.invalid;
  }

  const lines: string[] = [];
  const emitLine = (l: string) => {
    lines.push(l);
    if (!values.json) out(l);
  };
  const sampleRun = cfg.SAMPLE_MODE || body.options.sample_mode === true;
  if (sampleRun) emitLine(SAMPLE_BANNER);

  let envelope: RunEnvelope | RunErrorEnvelope | null = null;
  let failure: { status: number; code?: string; error?: string } | null = null;
  const base = apiBase(cfg, values.api);
  const alive = values.local ? { ok: false, mode: null } : await apiAlive(base);
  // A SAMPLE_MODE CLI never forwards to a live API: it would start a live run (seen 14:25Z). It runs in-process instead.
  const forward = alive.ok && !(cfg.SAMPLE_MODE && alive.mode !== "sample");

  if (forward) {
    const r = await followRun(base, body, emitLine).catch((e: unknown) => {
      failure = { status: 502, error: e instanceof Error ? "The API stopped answering." : "The API request failed." };
      return null;
    });
    if (r) {
      envelope = r.envelope;
      if (!envelope) {
        const b = r.answer.body as { error?: string; code?: string } | undefined;
        failure = { status: r.answer.status, ...(b?.code ? { code: b.code } : {}), ...(b?.error ? { error: b.error } : {}) };
      }
    }
  } else {
    const local = await openLocal(cfg, { quiet: !!values.json });
    try {
      await local.container.ports.world.open();
      const res = await local.app.inject({ method: "POST", url: "/run", payload: JSON.stringify(body), headers: { "content-type": "application/json" } });
      const parsed = res.json() as RunEnvelope | RunErrorEnvelope | { error: string; code?: string };
      if ("run_id" in parsed && "status" in parsed) envelope = parsed;
      else failure = { status: res.statusCode, ...(parsed.code ? { code: parsed.code } : {}), error: parsed.error };
    } catch (e) {
      const known = e instanceof AppError ? e : null;
      failure = { status: known?.httpStatus ?? 500, ...(known ? { code: known.code, error: known.message } : { error: "Internal error." }) };
    } finally {
      await local.close();
    }
  }

  if (!envelope) {
    err(`[ERROR] ${failure?.error ?? "The run did not finish."}${failure?.code ? ` (${failure.code})` : ""}`);
    return exitForHttp(failure?.status ?? 500, failure?.code);
  }
  if (values.json) out(JSON.stringify(envelope, null, 2));
  else {
    for (const l of renderResult(envelope, cfg.PAYEE_UI_URL)) emitLine(l);
    if (sampleRun) emitLine(SAMPLE_BANNER);
  }
  if (values["save-example"]) {
    const files = saveExample({ dir: values["save-example"], cfg, request: body, envelope, stdout: lines.join("\n"), mode: sampleRun ? "sample" : "live" });
    if (!values.json) out(`Saved ${files.length} files to ${values["save-example"]}`);
  }
  return exitCodeFor(envelope);
}
