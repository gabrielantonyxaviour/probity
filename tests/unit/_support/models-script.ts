// TEST SUPPORT. Scripted Nemotron stand-ins for orchestration tests: they read the same JSON the real prompts send and answer
// from it (never from canned decisions). Real-model behaviour is checked in the live runs.
import type { ChatRequest, ChatResult } from "../../../app/schemas/models";
import type { ExtractClaimsModel } from "../../../app/schemas/llm";
import type { ModelScript } from "./fakes";

export const S1_CLAIMS_MODEL: ExtractClaimsModel = {
  needs_human: null, account_number: "000999000141", unreadable_fields: [],
  claims: {
    claimed_name: "Booz Allen Hamilton Inc.", letterhead_name: "Booz Allen Hamilton Inc.",
    remit_address: { line1: "1 Commvault Way", unit: "Suite 205", city: "Tinton Falls", state: "NJ", zip: "07724" },
    bank: { bank_name: "Calderwick Test Bank (fictional)", routing: "110000000", account_last4: "0141" },
    sender_email: null, sender_domain: null, reply_to_domain: null,
    phones: [{ number: "(703) 555-0147", quote: "Direct questions to (703) 555-0147." }],
    effective_date: null, invoice_refs: ["INV-BAH-20931", "INV-BAH-20944", "INV-BAH-20967"], signer_name: "R. Castellane (fictional)",
    pressure_phrases: [{ quote: "Please do not use the old main number; it is being retired.", kind: "avoid_verification" }],
    watermark_text: "SYNTHETIC SAMPLE: not issued by Booz Allen Hamilton Inc",
    fields: [
      { field: "claimed_name", quote: "Booz Allen Hamilton Inc.", page: 1, bbox_hint: null },
      { field: "remit_address", quote: "New remit-to address: 1 Commvault Way, Suite 205, Tinton Falls, NJ 07724", page: 1, bbox_hint: null },
      { field: "bank_routing", quote: "Routing number: 110000000 (TEST ROUTING)", page: 1, bbox_hint: null },
      { field: "bank_account", quote: "Account number: 000999000141 (TEST ACCOUNT)", page: 1, bbox_hint: null },
      { field: "phone", quote: "Direct questions to (703) 555-0147.", page: 1, bbox_hint: null },
      { field: "invoice_ref", quote: "Invoices: INV-BAH-20931, INV-BAH-20944, INV-BAH-20967", page: 1, bbox_hint: null },
      { field: "pressure_phrase", quote: "Please do not use the old main number; it is being retired.", page: 1, bbox_hint: null },
      { field: "watermark", quote: "SYNTHETIC SAMPLE: not issued by Booz Allen Hamilton Inc", page: 1, bbox_hint: null },
    ],
  },
};

const userJson = (req: ChatRequest): Record<string, unknown> => {
  const last = req.messages.filter((m) => m.role === "user")[0]!.content;
  const text = typeof last === "string" ? last : last.map((p) => p.text).join("\n");
  const start = text.indexOf("{");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
};

export type ScriptOpts = {
  claims?: ExtractClaimsModel;
  scoutExtra?: boolean;
  critique?: (input: Record<string, unknown>) => Record<string, unknown>;
  rationale?: (input: RationaleInput) => string;
  /** D6 injection review: given the candidate span ids, return the model JSON. Default: every candidate confirmed. */
  review?: (spanIds: string[]) => Record<string, unknown>;
  /** Letter Reader answers in order (then `claims`): e.g. an "unreadable" answer first, to exercise the one retry. */
  claimsSeq?: Array<Record<string, unknown>>;
};

export const sentence = (t: string): string => (/[.!?]$/.test(t) ? t : `${t}.`);
export type RationaleInput = { decision: string; vendor_name: string; vendor_id: string; payment_run_id: string; codes: Array<{ class?: string; detail: string }>; callback: { number_display: string; number_source_label: string } | null; do_not_use: string[]; sweep: { k: number; amount_display: string } | null };
/** A faithful rationale in the gate_officer.md shape: lead, red reasons, caps, call-back, sweep. */
export function defaultRationale(i: RationaleInput): string {
  const join = (cls: string) => i.codes.filter((c) => (c.class ?? "red") === cls).map((c) => c.detail.replace(/[.\s]+$/, "")).join("; ");
  const reds = join("red");
  const caps = join("cap");
  const dnu = i.do_not_use as string[];
  const cb = i.callback ? `Call ${i.callback.number_display} (${i.callback.number_source_label})${dnu.length ? `, and do not use ${dnu.join(" or ")}` : ""}.` : null;
  const sweep = i.sweep && i.sweep.k > 0 ? `${i.sweep.k} other items totalling ${i.sweep.amount_display} in ${i.payment_run_id} also fail payment controls.` : null;
  return [`${i.decision} for ${i.vendor_name} in ${i.payment_run_id}.`, reds ? sentence(reds) : null, caps ? sentence(caps) : null, cb, sweep].filter(Boolean).join(" ");
}

export function scriptFor(o: ScriptOpts = {}): ModelScript {
  return (req): Partial<ChatResult> | null => {
    if (req.agent === "letter_reader" && req.response_schema?.name === "injection_review") {
      const first = req.messages.at(-1)!.content;
      const text = Array.isArray(first) ? first.map((p) => ("text" in p ? p.text : "")).join("\n") : String(first);
      const ids = [...text.matchAll(/^(inj-\d+) \(/gm)].map((m) => m[1]!);
      return { content: JSON.stringify(o.review ? o.review(ids) : { verdicts: ids.map((span_id) => ({ span_id, addressed_to_reviewer: true, asks: "approve" })), additional: [] }) };
    }
    if (req.agent === "letter_reader") return { content: JSON.stringify(o.claimsSeq?.shift() ?? o.claims ?? S1_CLAIMS_MODEL) };
    if (req.agent === "registry_scout") {
      const lastRole = req.messages.at(-1)!.role;
      if (lastRole === "tool" || !o.scoutExtra)
        return { content: "", tool_calls: [{ id: "tc-fin", name: "finish_round", arguments: { summary: "floor reviewed" }, parse_path: "native" }] };
      const lead = (userJson(req).leads as Array<{ name_norm: string }>)[0];
      if (!lead) return { content: "", tool_calls: [{ id: "tc-fin", name: "finish_round", arguments: { summary: "no useful lead" }, parse_path: "native" }] };
      return { content: "", tool_calls: [{ id: "tc-1", name: "run_template", arguments: { template_id: "T06", params: { name_norm: lead.name_norm }, purpose_field: "legal_name", why: "check aliases of the parent name" }, parse_path: "native" }] };
    }
    if (req.agent === "identity_examiner" && req.action === "approve_link") {
      const input = userJson(req);
      if (o.critique) return { content: JSON.stringify(o.critique(input)) };
      const sup = (input.supporting as Array<{ evidence_id: string }>).map((x) => x.evidence_id);
      const link = input.link as { link_id: string };
      return { content: JSON.stringify({ link_id: link.link_id, verdict: "approve", confidence: 0.82, cited_evidence_ids: sup.slice(0, 2), missing_evidence: [], conflict: null, rationale: `Invoice references and the exact legal name agree (${sup.slice(0, 2).join(", ")}).` }) };
    }
    if (req.agent === "identity_examiner") {
      const items = (userJson(req).items as Array<{ conflict_id: string; facts: Array<{ value: string }> }>) ?? [];
      return { content: JSON.stringify({ items: items.map((i) => ({ conflict_id: i.conflict_id, description: `Sources disagree: ${i.facts.map((f) => f.value).join(" versus ")}.` })) }) };
    }
    if (req.agent === "gate_officer") {
      const text = (o.rationale ?? defaultRationale)(userJson(req) as unknown as RationaleInput);
      return { content: JSON.stringify({ text }) };
    }
    return null;
  };
}
