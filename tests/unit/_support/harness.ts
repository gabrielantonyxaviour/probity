// TEST SUPPORT. Builds RunDeps over fakes and runs the real orchestrator end to end (real policy, real agents, real C2-C6).
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { RunInput } from "../../../app/schemas/api";
import type { RunDeps, AgentConfig } from "../../../app/orchestration/ctx";
import { runAgent } from "../../../app/orchestration";
import { getRunState } from "../../../app/orchestration/cancel";
import type { DocumentsPort, ResolvedInput } from "../../../app/agents/letter-reader/docs.port";
import { CL_L3, DQ1_INVALID, DQ2_INVALID, RUN_ITEMS, T02, T05, T05B, T07, T10_S1, T11_S1, VENDORS } from "./data";
import { FakeErp, FakeModels, FakeRegistrar, FakeTracer, FakeWorld, FakeZetaris, fakeDiscovery, makeKit, type Handlers, type Row } from "./fakes";
import { makePdf, S1_EML, S1_LETTER_LINES } from "./letter";
import { scriptFor, type ScriptOpts } from "./models-script";

export const universe = (extra: { calllog?: Row[]; erp?: FakeErp } = {}): Handlers => ({
  T01: (p) => (VENDORS[String(p.vendor_id)] ? [VENDORS[String(p.vendor_id)]!] : []),
  T02: (p) => T02[String(p.vendor_id)] ?? [],
  T03: (p) => (p.invoice_nos as string[]).flatMap((n) => {
    const v = n.startsWith("INV-BAH") ? "V-10027" : n.startsWith("INV-LDS") ? "V-10442" : n.startsWith("INV-L3H") ? "V-10198" : null;
    return v ? [{ invoice_no: n, vendor_id: v, amount_usd: 1, invoice_date: "2026-09-01", status: "scheduled" }] : [];
  }),
  T04: (p) => Object.values(VENDORS).filter((v) => String(v.email_domains_on_file).split(",").includes(String(p.domain))).map((v) => ({ vendor_id: v.vendor_id, legal_name: v.legal_name, email_domains_on_file: v.email_domains_on_file })),
  T04b: (p) => Object.values(VENDORS).filter((v) => String(v.legal_name).toUpperCase().includes(String(p.token))).map((v) => ({ vendor_id: v.vendor_id, legal_name: v.legal_name, name_norm: v.name_norm, uei: v.uei, registrant_cik: v.registrant_cik, status: "active" })),
  T05: (p) => (T05[String(p.vendor_id)] ? [T05[String(p.vendor_id)]!] : []),
  T05b: (p) => (T05B[String(p.parent_uei)] ? [T05B[String(p.parent_uei)]!] : []),
  T06a: (p) => (p.name_norm === "SCIENCE APPLICATIONS INTERNATIONAL CORP" ? [{ via: "alias", key: "UE9QJD4KK1L6-C", name: "SCIENCE APPLICATIONS INTERNATIONAL CORPORATION", name_norm: "SCIENCE APPLICATIONS INTERNATIONAL CORP", alias_source: "usaspending_alt" }] : []),
  T06b: (p) => (p.name_norm === "BOOZ ALLEN HAMILTON INC" ? [{ via: "entity", key: "JCBMLGPE6Z71-C", name: "BOOZ ALLEN HAMILTON INC", name_norm: "BOOZ ALLEN HAMILTON INC" }] : []),
  T06c: () => [],
  T07: (p) => [
    ...(T07[String(p.account_hash)] ?? []),
    ...[...(extra.erp?.rows.values() ?? [])].filter((r) => r.new_account_hash === p.account_hash).map((r) => ({ via: "bank_change_request", owner_vendor_id: r.vendor_id, request_id: r.request_id, bank_account_id: null, status: "pending", at_ts: "2026-10-22 15:12:00", vendor_name: null })),
  ],
  T08: (p) => (extra.calllog ?? [CL_L3]).filter((r) => r.request_id === p.request_id || r.vendor_id === p.vendor_id),
  T08b: (p) => [{ request_id: p.request_id, new_routing: "110000000", routing_check: "valid" }],
  T09: (p) => (p.payment_run_id === "PR-2026-10-30" ? RUN_ITEMS : []),
  T10: (p) => (p.parent_uei === "MBPHTU7Y9S65" ? [T10_S1] : []),
  T11: (p, c) => (p.addr_key === "1 COMMVAULT WAY|TINTON FALLS|NJ" && c.sessions.length ? [T11_S1] : []),
  T12: (_p, c) => [{ uei: "FFCMDLMXRK49", recipient_level: "P", name: "PARSONS CORPORATION", parent_uei: null, parent_name: null, address_line1: "14291 PARK MEADOW DR", city_name: "CHANTILLY", state_code: "VA", zip: "20151", sessions: c.sessions.length }],
  T14: () => [{ cik: "0000275880", name: "PARSONS CORP", phone: "703-988-8500", biz_street1: "5875 Trinity Pkwy #300", biz_city: "Centreville", biz_state: "VA" }],
  T16: (p) => (p.name_norm === "PARSONS CORP" ? [{ cik: "275880", ticker: "PSN", title: "PARSONS CORP" }] : []),
  T20: (p) => [p.rule === "DQ1" ? { total: 158, valid: 154, invalid: 4 } : { total: 158, valid: 155, invalid: 3 }],
  T21: (p) => (p.rule === "DQ1" ? DQ1_INVALID : DQ2_INVALID),
});

export const baseConfig = (logs: string): AgentConfig => ({
  RUN_BUDGET_SECONDS: 480, PREREGISTER_DISCOVERY: false, ZETARIS_DOWN_POLICY: "degrade", ZETARIS_MAX_CONCURRENCY: 3, SAMPLE_MODE: false,
  LANE_FAST_MODEL: "nvidia/nemotron-3.5-lightning-30b-a3b", LANE_DEEP_MODEL: "nvidia/nemotron-3-ultra-550b-a55b", L1_TOOL_MODE: "native",
  dirs: { logs, sample: path.join(logs, "sample") }, covered_vendors_path: path.join(logs, "covered.json"),
});

export async function s1Docs(lines: string[] = S1_LETTER_LINES, eml: string = S1_EML, example = "01-booz-allen-remit-change"): Promise<DocumentsPort> {
  const pdf = await makePdf(lines);
  const sha = createHash("sha256").update(lines.join("\n")).digest("hex");
  const resolved: ResolvedInput = {
    docs: [
      { doc_index: 1, kind: "letter", filename: "letter.pdf", media_type: "application/pdf", sha256: sha, page_count: 1, pdf_path: pdf, png_paths: [] },
      { doc_index: 2, kind: "eml_headers", filename: "headers.eml", media_type: "message/rfc822", sha256: "e".repeat(64), page_count: 1 },
    ],
    eml_headers: eml, example_id: example, channel: "email",
    doc_pages: [{ doc_index: 1, kind: "letter", page: 1, url: "/examples/01/files/letter.png", width: 1236, height: 1600 }],
  };
  return { resolve: async () => resolved };
}

export const S1_INPUT: RunInput = {
  example_id: "01-booz-allen-remit-change", request_id: "BCR-2026-0412", received_at: "2026-10-22T15:12:00Z", payment_run_id: "PR-2026-10-30",
  documents: [{ kind: "letter", file: "letter.pdf" }, { kind: "eml_headers", file: "headers.eml" }],
};

export type Rig = Awaited<ReturnType<typeof rig>>;
export async function rig(o: { script?: ScriptOpts; handlers?: Handlers; mode?: "live" | "sample"; budget?: number; calllog?: Row[]; docs?: DocumentsPort; listRuns?: boolean; discovery?: Array<{ uei: string; name: string; recipient_level: "P" | "C" | "R"; amount: number | null }> } = {}) {
  const logs = mkdtempSync(path.join(os.tmpdir(), "probity-logs-"));
  const erp = new FakeErp();
  const zetaris = new FakeZetaris(o.handlers ?? universe({ calllog: o.calllog, erp }));
  const registrar = new FakeRegistrar(zetaris);
  const discovery = fakeDiscovery(o.discovery ?? []);
  const world = new FakeWorld();
  const models = new FakeModels(scriptFor(o.script));
  const tracers: FakeTracer[] = [];
  const registered: string[] = [];
  writeFileSync(path.join(logs, "covered.json"), JSON.stringify({ families: ["MBPHTU7Y9S65", "JCBMLGPE6Z71", "0001443646"] }));
  const deps: RunDeps = {
    ports: { mode: o.mode ?? "live", zetaris, registrar, discovery, models, erp, world, memory: { enabled: false } as never, clock: { now: () => new Date() } },
    templates: makeKit(), config: baseConfig(logs), session_id: "s-test",
    makeTracer: (ids) => { const t = new FakeTracer(ids); tracers.push(t); return t; },
    docs: o.docs ?? (await s1Docs()), registerTransient: (_id, v) => void registered.push(v),
    listPaymentRuns: async () => [{ payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" }],
  };
  const run = async (input: RunInput = S1_INPUT, extra: Record<string, unknown> = {}) => {
    const env = await runAgent(input, { deps, session_id: "s-test", config: deps.config, ports: deps.ports, makeTracer: deps.makeTracer, ...(o.budget ? { budget_seconds: o.budget } : {}), ...extra } as never);
    return { env, tracer: tracers.at(-1)!, state: getRunState((env as { run_id: string }).run_id) };
  };
  return { deps, zetaris, registrar, world, erp, models, tracers, registered, logs, run };
}

