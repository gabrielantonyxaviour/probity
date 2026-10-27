// A2 tools (04 §5.2): definitions (OpenAI format, verbatim) and the guarded executor.
// Guards run in order: allowed -> zod -> param_unseen -> budget -> cache. The model never writes SQL.
import { randomUUID } from "node:crypto";
import type { ToolDef } from "../../schemas/models";
import type { GapRequest } from "../../schemas/messages";
import { TemplateParams } from "../../schemas/templates";
import { FindRecipientArgs, RecordFindingArgs, RegisterSourceArgs, RunTemplateArgs, type ToolResult } from "../../schemas/tools";
import type { RunContext } from "../../orchestration/ctx";
import { emit } from "../../orchestration/ctx";
import { projectForModel } from "../../components/evidence-obs";
import { Registrar } from "../../components/registrar";
import type { PolicyState } from "../../orchestration/state";
import { addrKey, nameNorm, nameToken } from "../../policy/normalise";
import { acceptedEvidence } from "../../policy/rows";

const FIELDS = ["legal_name", "remit_address", "bank_account", "sender_domain", "callback_phone", "parent", "registrant", "invoice_refs"];
const EV = "^ev-[0-9a-f]{8}-\\d{1,3}-(ln|ra|ba|sd|cp|pa|rg|ir)$";

export function toolDefs(allowedTemplates: string[], gap: GapRequest | null): ToolDef[] {
  const defs: ToolDef[] = [
    {
      type: "function",
      function: {
        name: "run_template",
        description: "Run one allow-listed query template in Zetaris. Returns evidence ids and up to 10 rows. You never write SQL.",
        parameters: {
          type: "object", additionalProperties: false, required: ["template_id", "params", "purpose_field"],
          properties: {
            template_id: { type: "string", enum: allowedTemplates },
            params: {
              type: "object", additionalProperties: false,
              properties: {
                vendor_id: { type: "string", pattern: "^V-\\d{5}$" },
                invoice_nos: { type: "array", maxItems: 10, items: { type: "string", pattern: "^INV-[A-Z]{3}-\\d{5}$" } },
                domain: { type: "string", pattern: "^[a-z0-9-]+(\\.[a-z0-9-]+)+$", maxLength: 120 },
                token: { type: "string", pattern: "^[A-Z0-9&]{3,40}$" },
                name_norm: { type: "string", pattern: "^[A-Z0-9& ]{2,120}$" },
                account_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
                request_id: { type: "string", pattern: "^BCR-2026-\\d{4}$" },
                parent_uei: { type: "string", pattern: "^[A-Z0-9]{12}$" },
                state: { type: "string", pattern: "^[A-Z]{2}$" },
                addr_key: { type: "string", pattern: "^[A-Z0-9 ]{3,80}\\|[A-Z ]{2,40}\\|[A-Z]{2}$" },
              },
            },
            purpose_field: { type: "string", enum: FIELDS },
            candidate_vendor_id: { type: ["string", "null"], pattern: "^V-\\d{5}$" },
            why: { type: "string", maxLength: 200 },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "record_finding",
        description: "Record what the evidence says about one claimed field. Cite evidence ids from tool results.",
        parameters: {
          type: "object", additionalProperties: false, required: ["field", "assessment", "evidence_ids", "note"],
          properties: {
            field: { type: "string", enum: FIELDS },
            candidate_vendor_id: { type: ["string", "null"], pattern: "^V-\\d{5}$" },
            assessment: { type: "string", enum: ["supports", "contradicts", "silent", "unclear"] },
            evidence_ids: { type: "array", maxItems: 8, items: { type: "string", pattern: EV } },
            note: { type: "string", maxLength: 240 },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "finish_round",
        description: "End your work for this round.",
        parameters: {
          type: "object", additionalProperties: false, required: ["summary"],
          properties: { summary: { type: "string", maxLength: 300 }, fields_covered: { type: "array", items: { type: "string" } }, open_questions: { type: "array", maxItems: 5, items: { type: "string", maxLength: 160 } } },
        },
      },
    },
  ];
  if (gap?.tools_allowed.includes("register_source"))
    defs.push({
      type: "function",
      function: {
        name: "register_source",
        description: "Register one discovered registry record as a Zetaris session table so it can be queried. Allowed only when the active GapRequest lists it.",
        parameters: {
          type: "object", additionalProperties: false, required: ["template_id", "why"],
          properties: {
            template_id: { type: "string", enum: ["T12", "T13", "T14"] }, uei: { type: "string", pattern: "^[A-Z0-9]{12}$" },
            level: { type: "string", enum: ["P", "C", "R"] }, parent_uei: { type: "string", pattern: "^[A-Z0-9]{12}$" },
            cik10: { type: "string", pattern: "^[0-9]{10}$" }, why: { type: "string", maxLength: 200 },
          },
        },
      },
    });
  if (gap?.tools_allowed.includes("find_recipient"))
    defs.push({
      type: "function",
      function: {
        name: "find_recipient",
        description: "Search USAspending recipients by name. Discovery only: results are candidates, never evidence. Allowed only inside a G2 GapRequest.",
        parameters: {
          type: "object", additionalProperties: false, required: ["name"],
          properties: { name: { type: "string", minLength: 2, maxLength: 120, pattern: "^[A-Za-z0-9 &.,'-]+$" }, limit: { type: "integer", minimum: 1, maximum: 8, default: 8 } },
        },
      },
    });
  return defs;
}

/** Every string (and name_norm of every short string) the run has seen: claims, candidates, rows, gap params. */
export function seenValues(s: PolicyState, gap: GapRequest | null): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown, depth = 0): void => {
    if (depth > 4 || v === null || v === undefined) return;
    if (typeof v === "string") {
      out.add(v);
      if (v.length <= 120) out.add(nameNorm(v));
      return;
    }
    if (Array.isArray(v)) return void v.forEach((x) => add(x, depth + 1));
    if (typeof v === "object") for (const x of Object.values(v)) add(x, depth + 1);
  };
  add(s.claims);
  add(s.candidates);
  add(gap?.params);
  for (const q of Object.values(s.queries)) {
    add(q.params);
    q.rows.forEach((r) => add(r));
    for (const r of q.rows) {
      const k = addrKey({ line1: String(r.address_line1 ?? r.usa_line1 ?? r.biz_street1 ?? r.p_address_line1 ?? ""), city: String(r.city_name ?? r.usa_city ?? r.biz_city ?? r.p_city_name ?? ""), state: String(r.state_code ?? r.usa_state ?? r.biz_state ?? r.p_state_code ?? "") });
      if (k) out.add(k.key);
    }
  }
  if (s.request_id) out.add(s.request_id);
  if (s.account_hash) out.add(s.account_hash);
  for (const d of [s.eml?.from_domain, s.eml?.reply_to_domain]) if (d) out.add(d);
  for (const n of [s.claims?.claimed_name, s.claims?.letterhead_name]) {
    if (!n) continue;
    out.add(nameNorm(n));
    const t = nameToken(n);
    if (t) out.add(t);
  }
  const ca = s.claims?.remit_address ? addrKey(s.claims.remit_address) : null;
  if (ca) out.add(ca.key);
  return out;
}

const GUARDED = ["vendor_id", "invoice_nos", "domain", "token", "name_norm", "account_hash", "request_id", "parent_uei", "addr_key"] as const;
export function unseenParam(p: Record<string, unknown>, seen: Set<string>): string | null {
  for (const k of GUARDED) {
    const v = p[k];
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (!seen.has(String(x))) return k;
  }
  return null;
}

export type ToolEnv = {
  ctx: RunContext;
  round: number;
  gap: GapRequest | null;
  allowed: string[];
  registrar: Registrar;
  candidate: string | null;
};

const bad = (error_code: Extract<ToolResult, { ok: false }>["error_code"], message: string): ToolResult => ({ ok: false, error_code, message });

export async function execTool(env: ToolEnv, name: string, raw: unknown): Promise<ToolResult> {
  const { ctx, round, gap } = env;
  const { s } = ctx;
  if (!ctx.budget.canA2Tool(round)) return bad("budget_exhausted", "No tool calls are left in this round.");
  ctx.budget.round(round).a2_tool_calls += 1;
  switch (name) {
    case "run_template": {
      const a = RunTemplateArgs.safeParse(raw);
      if (!a.success) return bad("param_invalid", "The arguments did not match the tool schema.");
      if (!env.allowed.includes(a.data.template_id)) return bad("not_allowed", `${a.data.template_id} is not allowed in this round.`);
      const unseen = unseenParam(a.data.params, seenValues(s, gap));
      const ids = a.data.template_id === "T06" ? (["T06a", "T06b", "T06c"] as const) : ([a.data.template_id] as const);
      const parsed = ids.map((id) => TemplateParams.safeParse({ template_id: id, ...a.data.params }));
      if (parsed.some((p) => !p.success)) return bad("param_invalid", "The parameters do not fit that template.");
      if (unseen) return bad("param_unseen", `The value for ${unseen} has not appeared in this run.`);
      const results = await Promise.all(
        parsed.map((p) =>
          ctx.C2.run({ params: p.data!, purpose_field: a.data.purpose_field, candidate_vendor_id: a.data.candidate_vendor_id ?? env.candidate, issued_by: "registry_scout", planned_by: "model", why: a.data.why }),
        ),
      );
      const okRes = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
      if (okRes.length === 0) return bad("source_unavailable", "The source did not answer.");
      const info = ctx.deps.templates.info(okRes[0]!.record.template_id);
      const rows = okRes.flatMap((r) => r.record.rows);
      return {
        ok: true, template_id: a.data.template_id, query_id: okRes[0]!.record.query_id, query_ids: okRes.map((r) => r.record.query_id),
        evidence_ids: okRes.flatMap((r) => r.observations.map((o) => o.evidence_id)), row_count: rows.length, mode: okRes[0]!.record.mode,
        truncated: rows.length > 10, rows: projectForModel(rows, info.llm_columns), ...(okRes.every((r) => r.cached) ? { note: "cached" } : {}),
      };
    }
    case "register_source": {
      if (!gap?.tools_allowed.includes("register_source")) return bad("not_allowed", "Registration needs an active gap request that lists it.");
      const a = RegisterSourceArgs.safeParse(raw);
      if (!a.success) return bad("param_invalid", "The arguments did not match the tool schema.");
      const r = await env.registrar.register(a.data);
      if (!r.ok) return bad(r.error_code, r.message);
      return { ok: true, template_id: a.data.template_id, query_id: r.query_id ?? randomUUID(), query_ids: [r.query_id ?? randomUUID()], evidence_ids: [], row_count: 0, mode: "live", truncated: false, rows: [{ table: r.table, reused: r.reused }] };
    }
    case "find_recipient": {
      if (!gap?.tools_allowed.includes("find_recipient")) return bad("not_allowed", "Name search needs an active G2 gap request.");
      const a = FindRecipientArgs.safeParse(raw);
      if (!a.success) return bad("param_invalid", "The arguments did not match the tool schema.");
      return findRecipient(ctx, a.data.name, a.data.limit);
    }
    case "record_finding": {
      const a = RecordFindingArgs.safeParse(raw);
      if (!a.success) return bad("param_invalid", "The arguments did not match the tool schema.");
      const known = new Set(acceptedEvidence(s).map((o) => o.evidence_id));
      const accepted = a.data.evidence_ids.every((e) => known.has(e));
      s.findings.push({ finding_id: `f-${s.findings.length + 1}`, by: "registry_scout", field: a.data.field, candidate_vendor_id: a.data.candidate_vendor_id ?? null, assessment: a.data.assessment, evidence_ids: a.data.evidence_ids, note: a.data.note, round, accepted });
      emit(ctx, { agent_name: "registry_scout", action: "record_finding", status: accepted ? "success" : "partial_success", field: a.data.field, input_summary: a.data.field, output_summary: `${a.data.field} ${a.data.assessment}${accepted ? "" : " (cites unknown evidence; not accepted)"}: ${a.data.note}` });
      return { ok: true, template_id: "record_finding", query_id: "n/a", query_ids: ["n/a"], evidence_ids: [], row_count: 0, mode: "live", truncated: false, rows: [], note: accepted ? "recorded" : "not accepted: unknown evidence ids" };
    }
    default:
      return bad("not_allowed", `Unknown tool ${name}.`);
  }
}

/** D3 name search: discovery only. Candidates are never evidence; their UEIs become "seen" for register_source. */
export async function findRecipient(ctx: RunContext, name: string, limit: number): Promise<ToolResult> {
  const { s, deps } = ctx;
  const t0 = Date.now();
  try {
    const r = await deps.ports.discovery.searchRecipients(name, { timeoutMs: ctx.budget.allowMs(30_000), signal: ctx.signal, limit });
    const qid = randomUUID();
    for (const c of r.candidates) ctx.seen.ueis.add(c.uei);
    s.queries[qid] = {
      query_id: qid, template_id: "T15", params: { name }, sql: "", sql_hash: "", issued_by: "registry_scout", purpose_field: "legal_name", candidate_vendor_id: null,
      round: s.round, status: r.candidates.length ? "ok" : "empty", mode: "discovery_only", rows: r.candidates.map((c) => ({ uei: c.uei, name: c.name, recipient_level: c.recipient_level, amount: c.amount })),
      row_hash: null, row_count: r.candidates.length, latency_ms: r.latency_ms ?? Date.now() - t0, fetched_at: r.fetched_at, retry_count: 0, error_code: null, evidence_ids: [],
    };
    emit(ctx, { agent_name: "registry_scout", action: "run_template", status: "success", template_id: "T15", zetaris_query_ids: [qid], rows: r.candidates.length, source_mode: "discovery_only", planned_by: "code", input_summary: `T15 name=${name}`, output_summary: `rows=${r.candidates.length} discovery only, not evidence` });
    return { ok: true, template_id: "T15", query_id: qid, query_ids: [qid], evidence_ids: [], row_count: r.candidates.length, mode: "discovery_only", truncated: false, rows: s.queries[qid]!.rows.slice(0, 8) };
  } catch {
    return { ok: false, error_code: "source_unavailable", message: "The name search did not answer." };
  }
}
