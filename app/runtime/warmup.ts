// Warm-up (05 §4.12): run before any demo or recording, because Nightshift's idle posture makes the first interactive
// request slow. Steps 1-6: catalog, READY ping per lane (max_tokens 800, thinking off), the L1 tool probe, the K4d Ultra
// forms, the H-MEM same-id vs per-call probe, and the A-02 cross-check probe once the fixture exists. Every call is a real
// model call; the record is logs/warmup-<UTC>.json (no token, no headers). Exit 0 both lanes confirmed, 2 routed_unconfirmed, 1 otherwise.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Config } from "../config/env";
import { utcCompact } from "../lib/clock";
import { fetchText, safeJson } from "../lib/http";
import type { NightshiftClient } from "../adapters/nightshift/client";
import { headersFor } from "../adapters/nightshift/request";
import { parseResponse } from "../adapters/nightshift/response";
import { isModelFailure } from "../adapters/nightshift/errors";
import type { ChatRequest, ChatResult } from "../schemas/models";
import { masker } from "../trace/mask";

type Json = Record<string, unknown>;
export type WarmupRecord = {
  at: string;
  run_id: string;
  catalog: { status: string; count: number; ids: string[] };
  lanes: Record<string, Json>;
  L1_TOOL_MODE: "native" | "json" | "untested";
  REASONING_CONTROL: string;
  k4d: Record<string, Json>;
  hmem: { same_id: Json[]; per_call: Json[]; by_scope: Record<string, { same_id: Json[]; per_call: Json[] }> };
  cross_check: Json;
  exit_code: 0 | 1 | 2;
};

const PROBE_SCHEMA = {
  type: "object",
  properties: { vendor: { type: "string" }, amount_usd: { type: "number" } },
  required: ["vendor", "amount_usd"],
  additionalProperties: false,
};
const PROBE_TEXT = "Extract: Northgate Fabrication LLC (fictional) asks to be paid 1204.50 USD for invoice INV-NGF-00417.";

export async function runWarmup(
  cfg: Config,
  client: NightshiftClient,
  o: { onStep?: (s: string) => void; probeFixture?: string } = {},
): Promise<WarmupRecord> {
  const step = o.onStep ?? (() => undefined);
  const stamp = utcCompact(new Date()).toLowerCase();
  const run_id = `warmup-${stamp}`;
  let call = 0;
  const base = (lane: "fast" | "deep", over: Partial<ChatRequest>): ChatRequest => ({
    lane,
    agent: "orchestrator",
    action: "model_check",
    messages: [{ role: "user", content: "Reply with the single word READY." }],
    reasoning: "off",
    temperature: 0,
    max_tokens: 800,
    expect: "text",
    run: { run_id, round: 0, call_index: ++call },
    trace: false,
    ...over,
  } as ChatRequest);
  const attempt = async (req: ChatRequest): Promise<{ ok: boolean; r?: ChatResult; code?: string }> => {
    try {
      return { ok: true, r: await client.chat(req) };
    } catch (e) {
      return { ok: false, code: isModelFailure(e) ? e.code : "internal_error" };
    }
  };

  step("catalog");
  const cat = await client.refresh(true);
  const lanes: WarmupRecord["lanes"] = {};
  for (const lane of ["fast", "deep"] as const) {
    step(`ping ${lane}`);
    const res = await attempt(base(lane, {}));
    const st = (await client.status()).lanes[lane];
    lanes[lane] = {
      pin_source: st.pin_source,
      requested_model: st.requested_model,
      returned_model: res.r?.model ?? null,
      model_source: res.r?.model_source ?? null,
      state: st.state,
      nemotron: res.r?.nemotron ?? false,
      latency_ms: res.r?.latency_ms ?? null,
      tokens: res.r ? { in: res.r.tokens_in, out: res.r.tokens_out } : null,
      ok: res.ok,
      ...(res.code ? { error: res.code } : {}),
    };
  }
  lanes.vision = { state: "unavailable", reason: "no image path to NVIDIA on this edition" };

  step("L1 tool probe");
  const probe = await attempt(
    base("fast", {
      action: "plan_coverage",
      agent: "registry_scout",
      messages: [{ role: "user", content: "Look up vendor V-10027's profile." }],
      tools: [{ type: "function", function: { name: "run_template", description: "Run one allow-listed query template.", parameters: { type: "object", properties: { template_id: { type: "string" }, vendor_id: { type: "string" } }, required: ["template_id"] } } }],
      expect: "tool_calls",
      max_tokens: 800,
    }),
  );
  const toolOk = (probe.r?.tool_calls.length ?? 0) > 0;
  (lanes.fast as Json).tool_call_ok = toolOk;
  (lanes.fast as Json).image_ok = false;
  (lanes.fast as Json).extras_unsupported = client.currentToolMode() === "json";

  step("K4d json forms");
  const form = async (name: string, req: ChatRequest): Promise<Json> => {
    const res = await attempt(req);
    const zod_ok = ((): boolean => {
      try {
        const j = JSON.parse(res.r?.content ?? "null") as Json;
        return typeof j.vendor === "string" && typeof j.amount_usd === "number";
      } catch {
        return false;
      }
    })();
    return { form: name, ok: res.ok, structured_output: res.r?.receipt?.envelope.structured_output ?? null, zod_ok, latency_ms: res.r?.latency_ms ?? null, ...(res.code ? { error: res.code } : {}) };
  };
  const user = [{ role: "user" as const, content: PROBE_TEXT }];
  const k4d: WarmupRecord["k4d"] = {
    json_thinking_off: await form("json_thinking_off", base("deep", { messages: user, expect: "json", response_schema: { name: "probe", schema: PROBE_SCHEMA }, max_tokens: 800 })),
    json_thinking_on: await form("json_thinking_on", base("deep", { agent: "identity_examiner", action: "approve_link", reasoning: "on", messages: user, expect: "json", response_schema: { name: "probe", schema: PROBE_SCHEMA }, max_tokens: 4096 })),
    forced_tool: await form("forced_tool", base("deep", {
      messages: user,
      expect: "json",
      tools: [{ type: "function", function: { name: "submit_probe", description: "Submit the result.", parameters: PROBE_SCHEMA } }],
      tool_choice: { type: "function", function: { name: "submit_probe" } },
    })),
  };

  step("H-MEM probe");
  const hmem = await hmemProbe(cfg, stamp);

  step("cross-check probe");
  const cross = await crossCheckProbe(cfg, client, base, o.probeFixture);

  const states = ["fast", "deep"].map((l) => lanes[l]!.state as string);
  const exit_code: 0 | 1 | 2 = states.every((s) => s === "confirmed_nemotron") ? 0 : states.some((s) => s === "routed_unconfirmed") && !states.some((s) => s === "unavailable" || s === "untested" || s === "non_nemotron") ? 2 : 1;
  const record: WarmupRecord = {
    at: new Date().toISOString(),
    run_id,
    catalog: { status: cat.status, count: cat.ids.length, ids: cat.ids },
    lanes,
    L1_TOOL_MODE: probe.ok ? (toolOk ? "native" : "json") : "untested",
    REASONING_CONTROL: cfg.REASONING_CONTROL,
    k4d,
    hmem,
    cross_check: cross,
    exit_code,
  };
  const dir = cfg.dirs.logs;
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `warmup-${stamp.toUpperCase()}.json`);
  writeFileSync(file, JSON.stringify(masker.deep(record), null, 2));
  return record;
}

/**
 * Does Nightshift's H-MEM inject an earlier answer? (REV-57) The same READY prompt the lane ping uses (so an earlier answer
 * exists) is sent with the same app id twice and with two fresh ids, under both `meterless-scope` values. Live finding
 * 2026-10-27: scope `user` injects across app ids. A shared `app` scope later injected too, once runs had mined answers into
 * it, so `app` mode now sends a per-call partition (`scopeFor` in the Nightshift adapter).
 */
async function hmemProbe(cfg: Config, stamp: string): Promise<WarmupRecord["hmem"]> {
  const token = cfg.METERLESS_RUNTIME_TOKEN;
  const model = cfg.LANE_FAST_MODEL;
  if (!token || !model) return { same_id: [], per_call: [], by_scope: {} };
  const once = async (app: string, scope: "user" | "app"): Promise<Json> => {
    try {
      const res = await fetchText(`${cfg.METERLESS_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: headersFor(token, app, scope),
        timeoutMs: 90_000,
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word READY." }], max_tokens: 800, temperature: 0, stream: false, chat_template_kwargs: { enable_thinking: false } }),
      });
      const p = parseResponse(safeJson(res.text), res.headers, { expect: "text" });
      const hm = (p.receipt?.hmem ?? {}) as Json;
      return { app, scope, injected: p.hmem_injected, top_score: hm.top_score ?? null };
    } catch {
      return { app, scope, injected: null, top_score: null, error: true };
    }
  };
  const by_scope: Record<string, { same_id: Json[]; per_call: Json[] }> = {};
  for (const scope of ["user", "app"] as const) {
    const same = `probity-warmup-${stamp}-${scope}-same`.slice(0, 48);
    by_scope[scope] = {
      same_id: [await once(same, scope), await once(same, scope)],
      per_call: [await once(`probity-warmup-${stamp}-${scope}-1`.slice(0, 48), scope), await once(`probity-warmup-${stamp}-${scope}-2`.slice(0, 48), scope)],
    };
  }
  const active = by_scope[cfg.METERLESS_SCOPE] ?? { same_id: [], per_call: [] };
  return { ...active, by_scope };
}

/** The A-02 fixture as text: a .txt/.md file, or the text layer of letter.pdf (pdftotext). */
function readFixture(cfg: Config, given?: string): string | null {
  const dir = path.resolve(cfg.dirs.examples, "..", "tests", "eval", "fixtures", "a02");
  const file = given && existsSync(given) ? given : existsSync(dir) ? readdirSync(dir).map((n) => path.join(dir, n)).find((f) => /\.(txt|md|pdf)$/i.test(f) && /letter|text|a02/i.test(path.basename(f))) : undefined;
  if (!file) return null;
  if (!/\.pdf$/i.test(file)) return readFileSync(file, "utf8");
  try {
    return execFileSync("pdftotext", ["-l", "2", file, "-"], { timeout: 20_000 }).toString();
  } catch {
    return null;
  }
}

/** The A-02 letter (an embedded instruction) through extract_claims on Ultra: record the cross-check verdict (REV-64). */
async function crossCheckProbe(cfg: Config, client: NightshiftClient, base: (l: "fast" | "deep", o: Partial<ChatRequest>) => ChatRequest, given?: string): Promise<Json> {
  const fixture = readFixture(cfg, given);
  if (!fixture) return { status: "skipped", reason: "tests/eval/fixtures/a02 has no letter text yet" };
  const text = fixture.slice(0, 6000);
  try {
    const r = await client.chat(base("deep", { agent: "letter_reader", action: "extract_claims", messages: [{ role: "user", content: text }], expect: "json", response_schema: { name: "claims_probe", schema: { type: "object", properties: { claimed_name: { type: ["string", "null"] } }, required: ["claimed_name"], additionalProperties: false } }, max_tokens: 1200 }));
    const cc = (r.receipt?.cross_check ?? {}) as Json;
    return { status: "ran", risk_level: cc.risk_level ?? null, recommended_action: cc.recommended_action ?? null, verifier_model: cc.verifier_model ?? null, latency_ms: r.latency_ms };
  } catch (e) {
    return { status: "blocked_or_failed", code: isModelFailure(e) ? e.code : "internal_error" };
  }
}
