// Outcome recording shared by POST /outcomes and a denied call-back (J3). Reads the latest finished run for the request,
// flags the request's artifacts in the World Model (fail-safe target rules live in the engine), writes the H-MEM summary when
// that engine is on, and rejects the request in the ERP on fraud_confirmed (spine §4.2). Results persist across sessions.
import type { Container } from "../runtime/container";
import type { GateDecision } from "../schemas/decision";
import type { OutcomeBody } from "../schemas/api-routes";
import { OutcomeResponse } from "../schemas/api-routes";
import type { OutcomeWriteX } from "../engines/wm-adapter";
import { logger } from "../trace/logger";
import { fail } from "./error-handler";

const maskTarget = (kind: string, id: string, last4: string | null): string => {
  if (kind === "bank_account") return `••••${last4 ?? id.replace(/\D/g, "").slice(-4)}`;
  if (kind === "phone") return `+1•••••••${id.replace(/\D/g, "").slice(-4)}`;
  return id.replace(/^domain:(domain:)?/, "");
};
const maskValue = (v: string): string => (/^\+?\d[\d\s().-]{6,}$/.test(v) ? `${v.startsWith("+") ? "+" : ""}•••••${v.replace(/\D/g, "").slice(-4)}` : v);

export function protectedValues(d: GateDecision | null): { phones_e164: string[]; domains: string[] } {
  const phones = (d?.callback_scripts ?? []).map((s) => s.number_e164);
  const domains = (d?.fact_sheet ?? [])
    .filter((r) => r.field === "sender_domain")
    .flatMap((r) => r.observations.filter((o) => o.source === "vendor_master" && o.value).map((o) => o.value as string));
  return { phones_e164: [...new Set(phones)], domains: [...new Set(domains)] };
}

export async function recordRequestOutcome(c: Container, body: OutcomeBody) {
  const latest = c.registry.latestForRequest(body.request_id, true);
  if (!latest) throw fail("no_run_for_request", "No finished check exists for this request.");
  const decision = latest.live.decision;
  const state = c.registry.stateOf(latest.run_id);
  const at = new Date().toISOString();
  const outcome: OutcomeWriteX = {
    request_id: body.request_id,
    outcome: body.outcome,
    by: body.by,
    session_id: c.sessionId,
    at,
    run_id: latest.run_id,
    protected: protectedValues(decision),
  };
  const res = await c.ports.world.recordOutcome(outcome);

  const hits = body.outcome === "fraud_confirmed"
    ? c.ports.world.knownBad({
        account_hash: state?.account_hash ?? null,
        phones_e164: (state?.claims?.phones ?? []).map((p) => p.e164).filter((p): p is string => !!p),
        domains: [state?.eml?.from_domain, state?.eml?.reply_to_domain, latest.claims?.sender_domain].filter((d): d is string => !!d),
      })
    : [];
  const written = res.flagged.map((f) => ({
    target_kind: f.kind,
    target_id_masked: maskTarget(f.kind, f.entity_id, state?.account_last4 ?? null),
    predicate: "fraud_flag" as const,
    fact_id: hits.find((h) => h.entity_id === f.entity_id && h.request_id === body.request_id)?.fact_id ?? f.entity_id,
  }));
  const skipped = res.skipped.map((s) => ({ value_masked: maskValue(s.value), reason: s.reason }));

  if (c.ports.memory.enabled) {
    try {
      await c.ports.memory.addOutcome({ ...outcome, vendor_id: decision?.resolved.vendor_id ?? null, legal_name: decision?.resolved.vendor_name ?? null });
    } catch (err) {
      logger.warn({ run_id: latest.run_id, err }, "hmem_outcome_failed");
    }
  }
  let note = `${body.request_id} ${body.outcome}`;
  if (body.outcome === "fraud_confirmed") {
    try {
      await c.ports.erp.setRequestStatus(body.request_id, "rejected");
    } catch (err) {
      note += "; erp_status_update_failed";
      logger.warn({ request_id: body.request_id, err }, "erp_status_update_failed");
    }
  }
  c.writer.begin(latest.run_id, latest.trace_id);
  c.writer.emit({
    run_id: latest.run_id,
    agent_name: "orchestrator",
    action: "outcome_recorded",
    status: "success",
    engine: "world_model",
    engine_op: "recordOutcome",
    input_summary: `${body.by}: ${body.outcome}`,
    output_summary: `${note}; flagged ${written.length}, skipped ${skipped.length}`,
  });
  c.writer.end(latest.run_id);
  return OutcomeResponse.parse({ written, skipped });
}
