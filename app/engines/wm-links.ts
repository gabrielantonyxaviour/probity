// Link verdict writes (05 2.4, 2.8): facts `link:<type>:<to_id>` on the request. Agent facts take the run clock
// (`runStartMs + seq`), never wall time, so verdicts inside one run are strictly ordered and latestFact is deterministic.
import { externalId } from "./world-model/index.ts";
import type { Prov } from "../schemas/engines";
import type { ExaminerVerdict, LinkProposal, LinkType } from "../schemas/messages";
import { linkId, type LinkValue } from "./wm-read";
import type { RunClock, Writer } from "./wm-writer";

type Proposal = LinkProposal & { link_type: LinkType; request_id: string };
type Verdict = ExaminerVerdict & {
  link_type: LinkType;
  request_id: string;
  from: string;
  to: string;
  confidence: number;
};

const agentProv = (clock: RunClock, prov: Prov): Prov => ({
  ...prov,
  kind: "agent",
  at: clock.tick(prov.runId, prov.at),
});

/** Hard links are approved by rules at once; soft links stay pending until the Examiner rules (A3). */
export async function proposeLinkOp(w: Writer, clock: RunClock, p: Proposal, prov: Prov): Promise<void> {
  const about = externalId("request", "req", p.request_id);
  const predicate = `link:${p.link_type}:${p.to}`;
  const hard = p.hardness === "hard";
  const cur = w.latestFact(about, predicate);
  const prev = cur?.value as LinkValue | undefined;
  // never downgrade a verdict reached earlier in this run (a re-proposal after a requery)
  if (prev && cur!.source.runId === prov.runId && (hard ? prev.status === "approved" : prev.status !== "pending"))
    return;
  const value: LinkValue = {
    status: hard ? "approved" : "pending",
    from: p.from,
    to: p.to,
    by: hard ? "rules" : prov.by,
    rule_hits: [],
    evidence_ids: p.evidence_ids,
    model: null,
    confidence: hard ? 1 : 0.5,
    link_id: p.link_id || linkId(p.link_type, p.from, p.to),
  };
  await w.fact(about, predicate, value, agentProv(clock, prov), value.confidence);
}

export async function recordVerdictOp(w: Writer, clock: RunClock, v: Verdict, prov: Prov): Promise<void> {
  const about = externalId("request", "req", v.request_id);
  const predicate = `link:${v.link_type}:${v.to}`;
  const prev = w.latestFact(about, predicate)?.value as LinkValue | undefined;
  const value: LinkValue = {
    status: v.verdict === "approve" ? "approved" : v.verdict === "reject" ? "rejected" : "pending",
    from: v.from,
    to: v.to,
    by: prov.by,
    rule_hits: v.rule_hits,
    evidence_ids: prev?.evidence_ids ?? [],
    model: v.model,
    confidence: v.confidence,
    link_id: v.link_id || linkId(v.link_type, v.from, v.to),
  };
  await w.fact(about, predicate, value, agentProv(clock, prov), v.confidence);
}
