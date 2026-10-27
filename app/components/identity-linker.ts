// C3 Identity Linker (04 §7.3): World Model writes with provenance, and LinkProposal construction with hardness.
// Frozen link types: attribution (candidate_vendor), vendor_entity (same_as), registrant (registered_as),
// remit_owner (requests_remit_to_match), alias (name_match).
import { AppError } from "../schemas/errors";
import type { TemplateRows, Prov } from "../schemas/engines";
import type { LinkProposal, LinkType } from "../schemas/messages";
import { emit, publish, type RunContext } from "../orchestration/ctx";
import type { LinkState, PolicyState } from "../orchestration/state";
import { claimedAddress, t11Matches } from "../policy/address";
import { nameNorm, sha16 } from "../policy/normalise";
import { acceptedEvidence, forVendor, queriesOf, str } from "../policy/rows";

type Seed = { type: LinkType; from: string; to: string; hardness: "hard" | "soft"; required: boolean; evidence_ids: string[]; note: string };

export const linkId = (type: string, from: string, to: string): string => `lnk-${sha16(type + from + to)}`;

const evOf = (s: PolicyState, qids: string[], field?: string): string[] =>
  acceptedEvidence(s).filter((o) => qids.includes(o.query_id) && (!field || o.field === field)).map((o) => o.evidence_id);

/** Seeds for every link the current evidence supports. Pure; idempotent by link_id. */
export function linkSeeds(s: PolicyState): Seed[] {
  const out: Seed[] = [];
  const req = `req:${s.request_id ?? s.run_id}`;
  for (const c of s.candidates) {
    out.push({
      type: "attribution", from: req, to: `vendor:${c.vendor_id}`, hardness: c.hardness, required: true,
      evidence_ids: evOf(s, c.evidence_ids), note: `candidate_vendor ${c.signals.join("+")} score ${c.score}`,
    });
    const q5 = queriesOf(s, "T05", forVendor(c.vendor_id))[0];
    const t5 = q5?.rows[0];
    const entity = str(t5?.entity_key);
    if (t5 && entity && c.uei) {
      out.push({ type: "vendor_entity", from: `vendor:${c.vendor_id}`, to: `uei:${entity}`, hardness: "hard", required: true, evidence_ids: evOf(s, [q5!.query_id], "legal_name"), note: "same_as via vendor.uei" });
      const cik = str(t5.cik);
      if (cik && c.registrant_cik === cik)
        out.push({ type: "registrant", from: `uei:${str(t5.parent_uei) ? `${str(t5.parent_uei)}-P` : entity}`, to: `cik:${cik}`, hardness: "hard", required: false, evidence_ids: evOf(s, [q5!.query_id], "registrant"), note: "registered_as via vendor.registrant_cik" });
    }
  }
  const claimed = claimedAddress(s);
  if (claimed) {
    for (const m of t11Matches(s)) {
      const to = `uei:${str(m.row.matched_uei)}-${str(m.row.matched_level) ?? "C"}`;
      out.push({
        type: "remit_owner", from: `addr:${claimed.parts.key}`, to, hardness: m.kind, required: true,
        evidence_ids: evOf(s, [m.query_id], "remit_address"), note: `requests_remit_to_match ${m.kind}`,
      });
    }
  }
  const names = [s.claims?.claimed_name, s.claims?.letterhead_name].filter((x): x is string => !!x);
  for (const q of queriesOf(s, "T06a")) {
    for (const r of q.rows) {
      const n = nameNorm(str(r.name_norm));
      if (!names.map(nameNorm).includes(n)) continue;
      const key = str(r.key) ?? "";
      const own = s.candidates.some((c) => (c.uei && key.startsWith(c.uei)) || (c.registrant_cik && key === c.registrant_cik));
      out.push({
        type: "alias", from: `party:${n}`, to: key.length === 10 ? `cik:${key}` : `uei:${key}`, hardness: own ? "hard" : "soft", required: false,
        evidence_ids: evOf(s, [q.query_id], "legal_name"), note: "name_match via alias",
      });
    }
  }
  // J5: a CIK found only by ticker (T16) is a soft registrant link that needs the Examiner (F29).
  for (const q of queriesOf(s, "T16"))
    for (const r of q.rows) {
      const cik = str(r.cik)?.padStart(10, "0");
      if (!cik) continue;
      const parent = s.extras.j5_families[0]?.uei ?? s.extras.j5_families[0]?.key;
      out.push({ type: "registrant", from: `uei:${parent ?? "unknown"}`, to: `cik:${cik}`, hardness: "soft", required: false, evidence_ids: evOf(s, [q.query_id], "registrant"), note: "registered_as via ticker" });
    }
  // J5 with a CIK given by the caller: the registrant is asserted by the input itself, not guessed from a ticker.
  const given = s.input.vendor?.cik;
  if (given && s.extras.j5_registrant?.cik === given.padStart(10, "0"))
    out.push({ type: "registrant", from: req, to: `cik:${given.padStart(10, "0")}`, hardness: "hard", required: false, evidence_ids: acceptedEvidence(s).filter((o) => o.field === "registrant" && o.source === "edgar").map((o) => o.evidence_id), note: "registered_as via caller CIK" });
  return out;
}

export class IdentityLinker {
  private ingested = new Set<string>();
  constructor(private readonly ctx: RunContext) {}

  private prov(kind: Prov["kind"], at: string): Prov {
    return { kind, by: "identity_linker", at, runId: this.ctx.s.run_id };
  }

  /** LINK stage: ingest new rows, build LinkProposals, write them as pending, trace each. */
  async link(): Promise<LinkState[]> {
    const { s, deps } = this.ctx;
    const batch: Array<TemplateRows & { params: Record<string, unknown> }> = Object.values(s.queries)
      .filter((q) => (q.status === "ok") && !this.ingested.has(q.query_id) && !["T09", "T20", "T21", "T30"].includes(q.template_id))
      .map((q) => ({ template_id: q.template_id, query_id: q.query_id, row_hash: q.row_hash ?? "", mode: q.mode === "discovery_only" ? "live" : q.mode, fetched_at: q.fetched_at, rows: q.rows, params: q.params }));
    if (batch.length) {
      try {
        const w = await deps.ports.world.ingestRows(batch, s.run_id);
        for (const b of batch) this.ingested.add(b.query_id);
        s.extras.graph_seq = deps.ports.world.worldSeq();
        emit(this.ctx, { agent_name: "identity_linker", action: "memory_write", status: "success", engine: "world_model", engine_op: "ingestRows", input_summary: `${batch.length} result sets`, output_summary: `entities ${w.entities_written}, edges ${w.edges_written}, facts ${w.facts_written} written; ${w.skipped_unchanged} unchanged` });
        publish(this.ctx, "graph", { world_seq: s.extras.graph_seq });
      } catch {
        emit(this.ctx, { agent_name: "identity_linker", action: "memory_write", status: "error", engine: "world_model", engine_op: "ingestRows", error_code: "world_model_unavailable", input_summary: `${batch.length} result sets`, output_summary: "World Model write failed" });
        throw new AppError("world_model_unavailable", "The World Model store could not be written.");
      }
    }
    const created: LinkState[] = [];
    for (const seed of linkSeeds(s)) {
      const id = linkId(seed.type, seed.from, seed.to);
      const prior = s.links[id];
      if (prior) {
        prior.evidence_ids = [...new Set([...prior.evidence_ids, ...seed.evidence_ids])];
        prior.hardness = seed.hardness === "hard" ? "hard" : prior.hardness;
        continue;
      }
      const link: LinkState = {
        link_id: id, type: seed.type, from: seed.from, to: seed.to, evidence_ids: seed.evidence_ids, hardness: seed.hardness,
        required: seed.required, status: "proposed", rule_hits: [], verdicts: [], requeried: false,
      };
      s.links[id] = link;
      created.push(link);
      const proposal: LinkProposal & { link_type: LinkType; request_id: string } = {
        link_id: id, type: seed.type, from: seed.from, to: seed.to, evidence_ids: seed.evidence_ids, hardness: seed.hardness,
        link_type: seed.type, request_id: s.request_id ?? s.run_id,
      };
      try {
        await deps.ports.world.proposeLink(proposal, this.prov("agent", new Date(deps.now?.() ?? Date.now()).toISOString()));
      } catch { /* the verdict write retries; a lost proposal is not fatal */ }
      emit(this.ctx, { agent_name: "identity_linker", action: "propose_link", status: "success", link_id: id, target_agent: "identity_examiner", engine: "world_model", engine_op: "proposeLink", input_summary: `round ${s.round} observations=${Object.keys(s.evidence).length}`, output_summary: `${seed.note}: ${seed.from} -> ${seed.to} ${seed.hardness}` });
    }
    return created;
  }
}
