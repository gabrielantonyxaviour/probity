// A2 Registry Scout (04 §2.3): the code coverage floor first, then Lightning tool turns that add checks on top of it.
// The floor is credited to a coverage rule; only run_template calls the model makes carry planned_by "model".
import type { Candidate } from "../../orchestration/state";
import { addPartial } from "../../orchestration/state";
import type { GapRequest } from "../../schemas/messages";
import type { ChatMessage, RawToolCall } from "../../schemas/models";
import { A2_TOOL_TEMPLATE_IDS } from "../../schemas/templates";
import { emit, type RunContext } from "../../orchestration/ctx";
import { modelFields } from "../../orchestration/model";
import { coveredKeys, Registrar } from "../../components/registrar";
import type { StepResult } from "../../components/evidence-runner";
import { projectForModel } from "../../components/evidence-obs";
import { floorStage, scoutLeads, type PlannedBy } from "./default-plan";
import { runDiscovery } from "./discovery";
import { scoutSystem, scoutTurn } from "./model-call";
import { execTool, toolDefs } from "./tools";

const TIER1 = A2_TOOL_TEMPLATE_IDS.filter((t) => !["T10", "T11", "T16"].includes(t)) as string[];

/** Run the floor stage by stage (T05b after T05; G1's registrations before T11). Returns every result. */
export async function runFloor(ctx: RunContext, round: number, gap: GapRequest | null, pb: PlannedBy, registrar: Registrar, only?: Candidate): Promise<StepResult[]> {
  const all: StepResult[] = [];
  for (let k = 0; k < 4; k++) {
    const st = floorStage(ctx.s, round, gap, k, pb, only, coveredKeys(ctx.deps.config.covered_vendors_path).ueis);
    if (st.steps.length === 0 && st.register.length === 0) {
      if (k >= 2) break;
      continue;
    }
    for (const r of st.register) await registrar.register(r);
    all.push(...(await ctx.C2.runMany(st.steps)));
  }
  return all;
}

const summaries = (ctx: RunContext, results: StepResult[]): Array<Record<string, unknown>> =>
  results.flatMap((r): Array<Record<string, unknown>> => {
    if (!r.ok) return [{ error: r.error_code }];
    const info = ctx.deps.templates.info(r.record.template_id);
    return [{ template_id: r.record.template_id, query_id: r.record.query_id, mode: r.record.mode, row_count: r.record.row_count, evidence_ids: r.record.evidence_ids.slice(0, 8), rows: projectForModel(r.record.rows, info.llm_columns).slice(0, 3) }];
  });

type Turn = { added: string[]; turns: number; lastModel: string | null; finished: boolean };

async function investigate(ctx: RunContext, round: number, gap: GapRequest | null, floor: StepResult[], registrar: Registrar, scope: Candidate | null, toolCap: number): Promise<Turn> {
  const { s } = ctx;
  const allowed = gap ? [...new Set([...TIER1, ...gap.tools_allowed.filter((t) => /^T\d/.test(t))])] : TIER1;
  const tools = toolDefs(allowed, gap);
  const user = {
    claims: { ...s.claims, fields: undefined },
    candidates: (scope ? [scope] : s.candidates).map((c) => ({ vendor_id: c.vendor_id, legal_name: c.legal_name, uei: c.uei, registrant_cik: c.registrant_cik, hardness: c.hardness })),
    round, floor_results: summaries(ctx, floor), leads: scoutLeads(s), gap_request: gap, allowed_templates: allowed,
    budget: { tool_calls_left: Math.min(toolCap, 10 - ctx.budget.round(round).a2_tool_calls), l1_turns_left: 4 - ctx.budget.round(round).a2_turns, seconds_left: Math.round(ctx.budget.remaining()) },
    recalled_notes: s.recalls.filter((r) => r.engine === "hmem").map((r) => r.text),
  };
  const messages: ChatMessage[] = [scoutSystem(), { role: "user", content: JSON.stringify(user) }];
  const out: Turn = { added: [], turns: 0, lastModel: null, finished: false };
  let invalid = 0;
  let used = 0;
  while (ctx.budget.canA2Turn(round) && !ctx.budget.low() && !ctx.signal.aborted && !out.finished && used < toolCap) {
    ctx.budget.round(round).a2_turns += 1;
    out.turns++;
    const res = await scoutTurn(ctx, messages, tools, `scout round ${round}${scope ? ` ${scope.vendor_id}` : ""}`);
    out.lastModel = res.model;
    if (res.tool_calls.length === 0) break;
    const raw: RawToolCall[] = res.tool_calls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.arguments) } }));
    messages.push({ role: "assistant", content: res.content ?? "", tool_calls: raw });
    const results = await Promise.all(
      res.tool_calls.map(async (tc) => {
        if (tc.name === "finish_round") {
          out.finished = true;
          return { id: tc.id, body: { ok: true, note: "round finished" } };
        }
        used++;
        const r = await execTool({ ctx, round, gap, allowed, registrar, candidate: scope?.vendor_id ?? null }, tc.name, tc.arguments);
        if (!r.ok) invalid++;
        else if (tc.name === "run_template" && !r.note) out.added.push(String(tc.arguments.template_id));
        return { id: tc.id, body: r };
      }),
    );
    for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: JSON.stringify(r.body) });
    if (invalid >= 3) break;
  }
  return out;
}

export async function runScout(ctx: RunContext, round: number, gap: GapRequest | null, registrar: Registrar): Promise<void> {
  const { s } = ctx;
  const sample = s.mode === "sample";
  const pbFloor: PlannedBy = sample ? "default_plan" : "coverage_floor";
  const t0 = Date.now();
  const floor = await runFloor(ctx, round, gap, pbFloor, registrar);
  if (gap?.rule === "G2") await runDiscovery(ctx, gap, registrar);
  const floorTemplates = [...new Set(floor.flatMap((r) => (r.ok ? [r.record.template_id] : [])))];
  if (sample) {
    emit(ctx, { agent_name: "registry_scout", action: "plan_coverage", status: "success", planned_by: "default_plan", note: "default (SAMPLE_MODE)", input_summary: `floor for round ${round}`, output_summary: `r${round}: ${floor.length} steps (${floorTemplates.join(", ")}), default plan, no model call` });
    return;
  }
  const scopes: Array<Candidate | null> = round === 0 && s.candidates.length >= 2 ? s.candidates.slice(0, 2) : [null];
  const cap = scopes.length === 2 ? 5 : 10;
  let turn: Turn = { added: [], turns: 0, lastModel: null, finished: false };
  let modelFailed = false;
  try {
    const turns = await Promise.all(scopes.map((c) => investigate(ctx, round, gap, floor, registrar, c, cap)));
    turn = { added: turns.flatMap((t) => t.added), turns: turns.reduce((a, t) => a + t.turns, 0), lastModel: turns[0]?.lastModel ?? null, finished: turns.every((t) => t.finished) };
  } catch {
    modelFailed = true;
    addPartial(s, "scout_default_plan");
    emit(ctx, { agent_name: "registry_scout", action: "fallback", status: "partial_success", planned_by: "default_plan", note: "default_plan", input_summary: `round ${round}`, output_summary: "Lightning unavailable; the coverage floor stands as the plan" });
  }
  const last = s.model_calls.filter((m) => m.agent === "registry_scout" && m.ok).at(-1);
  emit(ctx, {
    agent_name: "registry_scout", action: "plan_coverage", status: modelFailed ? "partial_success" : "success", planned_by: modelFailed ? "default_plan" : "model",
    lane: last ? "fast" : null, model: last?.model ?? null, requested_model: last?.requested_model ?? null, tokens_in: last?.tokens_in ?? null, tokens_out: last?.tokens_out ?? null,
    latency_ms: Date.now() - t0, note: modelFailed ? "default_plan" : turn.added.length ? `model added ${turn.added.length} check(s)` : "model reviewed floor",
    input_summary: `floor=${floorTemplates.join(",")}${gap ? ` gap ${gap.rule}` : ""}${scopes[0] ? ` candidates=${scopes.map((c) => c!.vendor_id).join(",")}` : ""}`,
    output_summary: `r${round}: floor ${floor.length} steps + ${turn.added.length} extra step(s)${turn.added.length ? ` (${[...new Set(turn.added)].join(", ")})` : " (reviewed the floor and added none)"}`,
  });
  void modelFields;
}
