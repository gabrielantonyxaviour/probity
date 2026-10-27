// Run envelopes (06 §4.2, 04 §2.1). `agents[]` is fixed role text; REV-59 suffixes are appended from models_used.
// The run-level error envelope's `error` is always ERROR_TEXT[code]: never an upstream, Zetaris, Spark or Postgres message.
import {
  AGENT_ROLES,
  FALLBACK_ROLE_SUFFIX,
  RunEnvelope,
  RunErrorEnvelope,
  SAMPLE_ROLE_SUFFIX,
} from "../schemas/api";
import { ERROR_TEXT, RECOVERABLE_RUN_ERRORS, RUN_ERROR_CODES, type RunErrorCode } from "../schemas/errors";
import type { GateDecision } from "../schemas/decision";

export const isRunErrorCode = (c: unknown): c is RunErrorCode => (RUN_ERROR_CODES as readonly string[]).includes(c as string);

export function errorEnvelope(a: { run_id: string; trace_id: string; code: RunErrorCode; seconds: number }): RunErrorEnvelope {
  return RunErrorEnvelope.parse({
    run_id: a.run_id,
    status: "error",
    error: ERROR_TEXT[a.code],
    code: a.code,
    recoverable: RECOVERABLE_RUN_ERRORS.includes(a.code),
    trace_id: a.trace_id,
    execution_time_seconds: a.seconds,
  });
}

/** The AGENT_ROLES list with the sample / fallback suffix per agent (REV-59). */
export function agentRoles(mode: "live" | "sample", decision: Pick<GateDecision, "models_used"> | null) {
  const calls = new Map<string, number>();
  for (const m of decision?.models_used ?? []) calls.set(m.agent, (calls.get(m.agent) ?? 0) + m.calls);
  return AGENT_ROLES.map((a) => {
    if (mode === "sample") return { name: a.name, role: `${a.role}${SAMPLE_ROLE_SUFFIX}` };
    const used = calls.get(a.name) ?? 0;
    // Without a decision (needs-human runs) there is no ledger to judge by: the base role stands.
    return { name: a.name, role: decision && used === 0 ? `${a.role}${FALLBACK_ROLE_SUFFIX}` : a.role };
  });
}

export const decisionOf = (env: RunEnvelope): GateDecision | null => {
  const art = env.output.artifacts.find((a) => a.type === "gate_decision");
  return art && art.type === "gate_decision" ? art.data : null;
};

/** Normalise whatever the orchestrator returned into a valid envelope: roles rebuilt, shape validated, errors made fixed text. */
export function finalizeEnvelope(
  raw: unknown,
  ctx: { run_id: string; trace_id: string; mode: "live" | "sample"; seconds: number },
): RunEnvelope | RunErrorEnvelope {
  const r = raw as { status?: unknown; code?: unknown } | null;
  if (r && r.status === "error") {
    const code = isRunErrorCode(r.code) ? r.code : "internal_error";
    return errorEnvelope({ ...ctx, code });
  }
  const parsed = RunEnvelope.safeParse(raw);
  if (!parsed.success) return errorEnvelope({ ...ctx, code: "internal_error" });
  const env = parsed.data;
  return { ...env, agents: agentRoles(ctx.mode, decisionOf(env)), run_id: ctx.run_id, trace_id: ctx.trace_id };
}
