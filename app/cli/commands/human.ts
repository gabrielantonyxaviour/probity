// probity callback | outcome | note: the same routes the UI buttons call (POST /callbacks, /outcomes, /notes). With a running
// API the CLI calls it; otherwise it calls the routes in-process, so a call-back is a real contact-log row and a real re-run.
import { parseArgs } from "node:util";
import { apiAlive, apiCall, type ApiAnswer } from "../remote";
import { EXIT, apiBase, err, exitForHttp, loadConfigOrExit, openLocal, out } from "../context";
import type { Config } from "../../config/env";

export type Callable = { method: "GET" | "POST"; path: string; body?: unknown };

/** Call the API if it answers, else the in-process routes. Waits for a re-evaluation run that an in-process call started. */
export async function callRoute(cfg: Config, c: Callable, o: { api?: string | undefined; local?: boolean | undefined }): Promise<ApiAnswer> {
  const base = apiBase(cfg, o.api);
  if (!o.local && (await apiAlive(base)).ok) return apiCall(base, c.method, c.path, c.body);
  const local = await openLocal(cfg, { quiet: false });
  try {
    await local.container.ports.world.open().catch(() => undefined);
    const res = await local.app.inject({ method: c.method, url: c.path, ...(c.body === undefined ? {} : { payload: JSON.stringify(c.body), headers: { "content-type": "application/json" } }) });
    const body = res.body ? (res.json() as unknown) : undefined;
    const runId = (body as { rerun?: { run_id?: string } } | undefined)?.rerun?.run_id;
    while (runId && local.container.registry.isRunning(runId)) await new Promise((r) => setTimeout(r, 500));
    return { status: res.statusCode, body };
  } finally {
    await local.close();
  }
}

export const toE164 = (s: string): string => {
  const d = s.replace(/\D/g, "");
  if (s.trim().startsWith("+")) return `+${d}`;
  return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : s;
};

function report(a: ApiAnswer): number {
  const b = a.body as { error?: string; code?: string } | undefined;
  if (a.status >= 200 && a.status < 300) {
    out(JSON.stringify(a.body, null, 2));
    return EXIT.ok;
  }
  err(`[ERROR] ${b?.error ?? "The request failed."}${b?.code ? ` (${b.code})` : ""}`);
  return exitForHttp(a.status, b?.code);
}

async function parseOrExit<T extends Record<string, { type: "string" | "boolean" }>>(argv: string[], options: T) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: false }).values as Record<string, string | boolean | undefined>;
  } catch (e) {
    err(`[ERROR] ${(e as Error).message}`);
    return null;
  }
}
const need = (v: Record<string, string | boolean | undefined>, names: string[]): string | null => {
  const missing = names.filter((n) => !v[n]);
  return missing.length ? `missing ${missing.map((n) => `--${n}`).join(", ")}` : null;
};

export async function callbackCommand(argv: string[]): Promise<number> {
  const v = await parseOrExit(argv, { request: { type: "string" }, vendor: { type: "string" }, phone: { type: "string" }, outcome: { type: "string" }, by: { type: "string" }, source: { type: "string" }, "called-at": { type: "string" }, "no-reevaluate": { type: "boolean" }, api: { type: "string" }, local: { type: "boolean" } });
  const miss = v && need(v, ["request", "vendor", "phone", "outcome", "by"]);
  if (!v || miss) {
    if (miss) err(`[ERROR] callback: ${miss}.`);
    return EXIT.invalid;
  }
  const cfg = loadConfigOrExit();
  if (!cfg) return EXIT.error;
  const body = {
    request_id: v.request,
    vendor_id: v.vendor,
    phone_e164: toE164(String(v.phone)),
    outcome: v.outcome,
    called_by: v.by,
    reevaluate: !v["no-reevaluate"],
    ...(v.source ? { phone_source: v.source } : {}),
    ...(v["called-at"] ? { called_at: v["called-at"] } : {}),
  };
  return report(await callRoute(cfg, { method: "POST", path: "/callbacks", body }, { api: v.api as string | undefined, local: v.local as boolean | undefined }));
}

export async function outcomeCommand(argv: string[]): Promise<number> {
  const v = await parseOrExit(argv, { request: { type: "string" }, outcome: { type: "string" }, by: { type: "string" }, note: { type: "string" }, api: { type: "string" }, local: { type: "boolean" } });
  const miss = v && need(v, ["request", "outcome", "by"]);
  if (!v || miss) {
    if (miss) err(`[ERROR] outcome: ${miss}.`);
    return EXIT.invalid;
  }
  const cfg = loadConfigOrExit();
  if (!cfg) return EXIT.error;
  const body = { request_id: v.request, outcome: v.outcome, by: v.by, ...(v.note ? { note: v.note } : {}) };
  return report(await callRoute(cfg, { method: "POST", path: "/outcomes", body }, { api: v.api as string | undefined, local: v.local as boolean | undefined }));
}

export async function noteCommand(argv: string[]): Promise<number> {
  const v = await parseOrExit(argv, { vendor: { type: "string" }, text: { type: "string" }, by: { type: "string" }, api: { type: "string" }, local: { type: "boolean" } });
  const miss = v && need(v, ["vendor", "text", "by"]);
  if (!v || miss) {
    if (miss) err(`[ERROR] note: ${miss}.`);
    return EXIT.invalid;
  }
  const cfg = loadConfigOrExit();
  if (!cfg) return EXIT.error;
  if (!cfg.ENABLE_HMEM) {
    out("H-MEM not enabled");
    return EXIT.ok;
  }
  const body = { vendor_id: v.vendor, text: v.text, author: v.by };
  return report(await callRoute(cfg, { method: "POST", path: "/notes", body }, { api: v.api as string | undefined, local: v.local as boolean | undefined }));
}
