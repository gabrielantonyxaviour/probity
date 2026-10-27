// C6 Memory Gate (04 §1): World Model fraud_flag recall for R5, and the H-MEM recall (COULD) when the engine is enabled.
// R5 counts only facts asserted before this run started (SCR-04-7), in any session.
import type { KnownBadHit } from "../schemas/engines";
import { emit, type RunContext } from "../orchestration/ctx";
import { toMs } from "../policy/normalise";

export async function recall(ctx: RunContext): Promise<KnownBadHit[]> {
  const { s, deps } = ctx;
  const domains = [s.eml?.from_domain, s.eml?.reply_to_domain].filter((d): d is string => !!d);
  const phones = s.extras.request_phones;
  let hits: KnownBadHit[];
  try {
    hits = deps.ports.world
      .knownBad({ account_hash: s.account_hash, phones_e164: phones, domains })
      .filter((h) => toMs(h.asserted_at) < toMs(s.extras.started_at));
  } catch {
    emit(ctx, { agent_name: "memory_gate", action: "memory_recall", status: "partial_success", engine: "world_model", engine_op: "knownBad", error_code: "world_model_unavailable", input_summary: "known-bad lookup", output_summary: "memory lookup failed; R5 not evaluated" });
    s.limitations.push("Memory lookup was unavailable; earlier confirmed impersonations were not checked.");
    s.partial_reasons.push("memory_unavailable");
    return [];
  }
  for (const h of hits)
    s.recalls.push({
      engine: "world_model", memory_id: h.fact_id, session_id: h.session_id,
      text: `Used in a request later confirmed as an impersonation (session ${h.session_id}).`,
      effect: "R5 known_bad_artifact", subject: `${h.kind}:${h.value_display}`, confidence: 1,
    });
  emit(ctx, {
    agent_name: "memory_gate", action: "memory_recall", status: "success", engine: "world_model", engine_op: "knownBad", target_agent: "registry_scout",
    input_summary: `account hash, ${phones.length} phone(s), ${domains.length} domain(s)`,
    output_summary: hits.length
      ? `${hits.length} hit(s): ${hits.map((h) => `${h.kind} ${h.value_display} (session ${h.session_id}, request ${h.request_id})`).join("; ")}`
      : "0 hits",
  });
  if (deps.ports.memory.enabled) {
    for (const c of s.candidates) {
      const r = await deps.ports.memory.recallForVendor({ vendor_id: c.vendor_id, legal_name: c.legal_name, uei: c.uei, registrant_cik: c.registrant_cik }).catch(() => null);
      if (!r) continue;
      for (const m of r.memories) {
        s.recalls.push({ engine: "hmem", memory_id: m.memory_id, session_id: m.session_id, text: m.text, effect: m.effect, subject: c.vendor_id, confidence: m.confidence });
        if (m.active) s.suppressed_rules.push({ rule: "G5", subject: c.vendor_id, memory_id: m.memory_id });
      }
      emit(ctx, { agent_name: "memory_gate", action: "memory_recall", status: "success", engine: "hmem", engine_op: "query topN=3", input_summary: `${c.legal_name} ${c.uei ?? ""} ${c.registrant_cik ?? ""}`, output_summary: `${r.memories.length} memor${r.memories.length === 1 ? "y" : "ies"}` });
    }
  }
  return hits;
}
