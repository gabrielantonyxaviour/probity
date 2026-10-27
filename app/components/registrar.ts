// C4 Registrar (04 §1, §5.2): the only path to DDL. Allow-listed T12/T13/T14 only, regex-validated keys, keys must have
// been seen in a T10/T15/T05 row or the covered slice, reuse of existing session tables, DDL <= 3 per run, serialised.
import { readFileSync } from "node:fs";
import { CIK10, UEI } from "../schemas/patterns";
import type { RegisterSourceArgs } from "../schemas/tools";
import type { RegistrationRequest, RegistrationResult } from "../schemas/ports";
import { emit, type RunContext } from "../orchestration/ctx";
import { Semaphore } from "../orchestration/parallel";
import { addLimitation, addPartial } from "../orchestration/state";

export type RegisterOutcome =
  | { ok: true; table: string; reused: boolean; preregistered: boolean; query_id: string | null }
  | { ok: false; error_code: "not_allowed" | "param_invalid" | "param_unseen" | "budget_exhausted" | "source_unavailable"; message: string };

type Keys = { ueis: Set<string>; ciks: Set<string> };
const coveredCache = new Map<string, { known: Keys; setup: Keys }>();
/** known = every key the file mentions (valid provenance for register_source); setup = what was registered at setup (REST tables exist). */
function covered(path: string): { known: Keys; setup: Keys } {
  const hit = coveredCache.get(path);
  if (hit) return hit;
  const known: Keys = { ueis: new Set(), ciks: new Set() };
  const setup: Keys = { ueis: new Set(), ciks: new Set() };
  try {
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(/\b[A-Z0-9]{12}\b/g)) if (/\d/.test(m[0]) && /[A-Z]/.test(m[0])) known.ueis.add(m[0]);
    for (const m of text.matchAll(/\b\d{10}\b/g)) known.ciks.add(m[0]);
    const j = JSON.parse(text) as { families?: Array<{ details?: Array<{ uei?: string }>; registrant_cik?: string }> };
    for (const f of j.families ?? []) {
      for (const d of f.details ?? []) if (d.uei) setup.ueis.add(d.uei);
      if (f.registrant_cik) setup.ciks.add(f.registrant_cik);
    }
  } catch {
    /* no covered slice file: only run-seen keys count */
  }
  const out = { known, setup };
  coveredCache.set(path, out);
  return out;
}
/** UEIs and CIKs registered at setup (families only): they have REST tables already, so G1 never re-registers them. */
export const coveredKeys = (path = "data/covered_vendors.json"): Keys => covered(path).setup;
export const resetCoveredCache = (): void => {
  coveredCache.clear();
};

export class Registrar {
  private readonly lock = new Semaphore(1);
  constructor(private readonly ctx: RunContext) {}

  /** Record keys from rows already in state (T10 children, T05 entity/parent/cik, T11 matches). */
  private seenKeys(): { ueis: Set<string>; ciks: Set<string> } {
    const out = { ueis: new Set(this.ctx.seen.ueis), ciks: new Set(this.ctx.seen.ciks) };
    for (const q of Object.values(this.ctx.s.queries)) {
      if (!["T10", "T15", "T05", "T05b", "T11", "T16"].includes(q.template_id)) continue;
      for (const r of q.rows)
        for (const k of ["child_uei", "uei", "parent_uei", "matched_uei"]) if (typeof r[k] === "string" && UEI.test(r[k] as string)) out.ueis.add(r[k] as string);
      for (const r of q.rows) if (typeof r.cik === "string" && CIK10.test(r.cik)) out.ciks.add(r.cik);
    }
    return out;
  }

  async register(a: RegisterSourceArgs): Promise<RegisterOutcome> {
    const { s, deps } = this.ctx;
    const key = a.template_id === "T14" ? a.cik10 : a.template_id === "T13" ? a.parent_uei : a.uei;
    const valid = a.template_id === "T14" ? !!key && CIK10.test(key) : !!key && UEI.test(key);
    if (!valid) return { ok: false, error_code: "param_invalid", message: "The key to register is not valid." };
    if (a.template_id === "T12" && !a.level) return { ok: false, error_code: "param_invalid", message: "A recipient level is required." };
    const seen = this.seenKeys();
    const cov = covered(deps.config.covered_vendors_path ?? "data/covered_vendors.json");
    const known = a.template_id === "T14" ? seen.ciks.has(key!) || cov.known.ciks.has(key!) : seen.ueis.has(key!) || cov.known.ueis.has(key!);
    if (!known) return { ok: false, error_code: "param_unseen", message: "That key has not appeared in any result for this run." };
    const existing = s.registered.find((r) => r.template_id === a.template_id && r.key === key);
    if (existing) return { ok: true, table: existing.table, reused: true, preregistered: existing.preregistered, query_id: existing.query_id };

    return this.lock.run(async () => {
      if (!this.ctx.budget.can("ddl")) {
        addLimitation(s, "Source registration limit reached for this run.");
        return { ok: false as const, error_code: "budget_exhausted" as const, message: "The registration limit for this run was reached." };
      }
      const req: RegistrationRequest =
        a.template_id === "T14"
          ? { kind: "registrant", cik10: a.cik10!, run_id: s.run_id }
          : a.template_id === "T13"
            ? { kind: "children", parent_uei: a.parent_uei!, run_id: s.run_id }
            : { kind: "recipient", uei: a.uei!, level: a.level!, run_id: s.run_id };
      let res: RegistrationResult;
      try {
        res = await deps.ports.registrar.register(req, { timeoutMs: this.ctx.budget.allowMs(120_000), signal: this.ctx.signal });
      } catch {
        addPartial(s, "registration_unavailable");
        addLimitation(s, `Registration unavailable for ${key}; its evidence is unknown.`);
        emit(this.ctx, { agent_name: "registrar", action: "register_source", status: "error", template_id: a.template_id, error_code: "registration_failed", planned_by: "code", input_summary: `${a.template_id} ${key}`, output_summary: "registration failed" });
        return { ok: false as const, error_code: "source_unavailable" as const, message: "Registration is unavailable." };
      }
      if (res.status === "unavailable") {
        addPartial(s, "registration_unavailable");
        addLimitation(s, `Registration unavailable for ${key}${res.reason ? `: ${res.reason}` : ""}; its evidence is unknown.`);
        emit(this.ctx, { agent_name: "registrar", action: "register_source", status: "error", template_id: a.template_id, error_code: "registration_unavailable", input_summary: `${a.template_id} ${key}`, output_summary: "registration unavailable" });
        return { ok: false as const, error_code: "source_unavailable" as const, message: "Registration is unavailable." };
      }
      const reused = res.status === "exists";
      const pre = res.status === "preregistered";
      if (res.status === "created") this.ctx.budget.spend("ddl");
      s.registered.push({ template_id: a.template_id, key: key!, table: res.table, reused, preregistered: pre, query_id: res.query_id ?? "" });
      emit(this.ctx, {
        agent_name: "registrar", action: "register_source", status: "success", template_id: a.template_id,
        zetaris_query_ids: res.query_id ? [res.query_id] : [], key: "admin", latency_ms: res.latency_ms,
        note: pre ? "pre-registered at setup" : reused ? "reused" : a.why.slice(0, 120),
        input_summary: `${a.template_id} ${a.template_id === "T12" ? `uei=${key} level=${a.level}` : key}`,
        output_summary: `${res.table} ${pre ? "pre-registered at setup" : reused ? "reused" : `created (DDL ${(res.latency_ms / 1000).toFixed(1)}s)`}`,
      });
      return { ok: true as const, table: res.table, reused, preregistered: pre, query_id: res.query_id };
    });
  }
}
