// C6 Memory Gate (05 2.9, 3.5): R5 recall from the World Model (always) and the E2 recall gate (only when H-MEM is
// enabled). Pure over the ports. Policy computes R5 from `known_bad`; this module emits no reason codes.
import type { GateDecision } from "../schemas/decision";
import type { KnownBadHit, MemoryPort, RequestRecord, WorldModelPort } from "../schemas/engines";
import type { TraceEventInput } from "../schemas/trace";
import { registrableDomain, toE164 } from "./wm-norm";

export type RecallVendor = { vendor_id: string; legal_name: string; uei: string | null; registrant_cik: string | null };
export type RecallInput = {
  world: WorldModelPort;
  memory: MemoryPort;
  request: RequestRecord;
  vendors: RecallVendor[];
  run_started_at: string;
  session_id: string;
};
export type RecallResult = {
  known_bad: KnownBadHit[];
  memory_recalled: GateDecision["memory_recalled"];
  suppress_g5: string[]; // vendor_ids, H-MEM only
  hmem_context: string | null; // the engine's [MEMORY CONTEXT] block for A3's L2 prompt
  events: TraceEventInput[];
};

const KIND_WORD: Record<KnownBadHit["kind"], string> = {
  bank_account: "bank account",
  phone: "phone number",
  domain: "sender domain",
};

export function requestArtifacts(r: RequestRecord): {
  account_hash: string | null;
  phones_e164: string[];
  domains: string[];
} {
  const phones = r.claims.phones.map((p) => p.e164 ?? toE164(p.number)).filter((p): p is string => !!p);
  const domains = [r.claims.sender_domain, r.claims.reply_to_domain]
    .map((d) => registrableDomain(d))
    .filter((d): d is string => !!d);
  return { account_hash: r.account_hash, phones_e164: [...new Set(phones)], domains: [...new Set(domains)] };
}

export async function recall(i: RecallInput): Promise<RecallResult> {
  const a = requestArtifacts(i.request);
  const started = Date.parse(i.run_started_at);
  // SCR-04-7: only memories written before this run started count
  const known_bad = i.world.knownBad(a).filter((h) => Date.parse(h.asserted_at) < started);
  const memory_recalled: RecallResult["memory_recalled"] = known_bad.map((h) => ({
    engine: "world_model",
    memory_id: h.fact_id,
    session_id: h.session_id,
    text: `Used in a request later confirmed as an impersonation (${h.session_id === i.session_id ? "earlier in this session" : `session ${h.session_id}`}).`,
    effect: `Raises R5: known bad ${KIND_WORD[h.kind]} ${h.value_display}. The request is held.`,
  }));
  const events: TraceEventInput[] = [
    {
      agent_name: "memory_gate",
      action: "memory_recall",
      status: "success",
      engine: "world_model",
      engine_op: "knownBad",
      input_summary: `${a.account_hash ? "1 account" : "no account"}, ${a.phones_e164.length} phones, ${a.domains.length} domains`,
      output_summary: `world_model fraud_flag: ${known_bad.length} hits`,
      codes: known_bad.length ? ["R5"] : [],
    },
  ];

  const suppress_g5: string[] = [];
  const contexts: string[] = [];
  if (i.memory.enabled) {
    let found = 0;
    for (const v of i.vendors) {
      const res = await i.memory.recallForVendor(v);
      found += res.memories.length;
      if (res.context) contexts.push(res.context);
      const active = res.memories.filter((m) => m.active);
      if (active.length) suppress_g5.push(v.vendor_id);
      for (const m of active) {
        memory_recalled.push({
          engine: "hmem",
          memory_id: m.memory_id,
          session_id: m.session_id,
          text: m.text,
          effect: m.effect,
        });
      }
    }
    events.push({
      agent_name: "memory_gate",
      action: "memory_recall",
      status: "success",
      engine: "hmem",
      engine_op: "query",
      input_summary: `${i.vendors.length} candidate vendors`,
      output_summary: `hmem: ${found} recalled, ${suppress_g5.length} vendors with an active note`,
    });
  }
  return {
    known_bad,
    memory_recalled,
    suppress_g5: [...new Set(suppress_g5)],
    hmem_context: contexts.length ? contexts.join("\n") : null,
    events,
  };
}
