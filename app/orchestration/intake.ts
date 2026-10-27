// INTAKE (F2, 04 §7.2): claims from A1, the sidecar, typed input or a stored run; hash the account and drop it; attribute
// candidate vendors BEFORE the insert (payee_app cannot UPDATE candidate_vendor_ids); insert the request; T09 exposure.
import { AppError } from "../schemas/errors";
import type { RunInput } from "../schemas/api";
import type { BankChangeDocumentRow, BankChangeRequestRow } from "../schemas/erp";
import type { ClaimSet } from "../schemas/messages";
import { readLetter } from "../agents/letter-reader";
import type { ResolvedInput } from "../agents/letter-reader/docs.port";
import { buildExposureStep } from "../agents/gate-officer/exposure-step";
import { emit, publish, type RunContext } from "./ctx";
import { loadState } from "./persist";
import { addLimitation } from "./state";
import type { Step } from "../components/evidence-runner";
import { attribute } from "../policy/identity";
import { parseEml } from "../policy/eml";
import { accountHash, nameNorm, nameToken, normaliseDomain, toE164 } from "../policy/normalise";
import { queriesOf, str } from "../policy/rows";

export type IntakeResult = { ok: true } | { ok: false; needs_human: "unreadable" | "model_unavailable" | "sample_mode_no_reader" };

/** Typed claims / name-only vendor -> ClaimSet (no document, so C4 stays). The raw account number is returned separately. */
export function claimsFromTyped(input: RunInput): { claims: ClaimSet; account_number: string | null; routing: string | null } {
  const c = input.claims;
  const acct = c?.bank?.account_number ?? null;
  const dom = (e?: string) => normaliseDomain(e ?? null);
  const claims: ClaimSet = {
    claimed_name: c?.claimed_name ?? input.vendor?.legal_name ?? null,
    letterhead_name: null,
    remit_address: c?.remit_address ? { line1: c.remit_address.line1, unit: c.remit_address.unit ?? null, city: c.remit_address.city, state: c.remit_address.state, zip: c.remit_address.zip ?? null } : null,
    bank: c?.bank ? { bank_name: c.bank.bank_name ?? null, routing: c.bank.routing, account_last4: acct ? acct.slice(-4) : null } : null,
    sender_email: c?.sender_email ?? null,
    sender_domain: dom(c?.sender_email),
    reply_to_domain: dom(c?.reply_to_email),
    phones: (c?.phones ?? []).map((n) => ({ number: n, quote: n, e164: toE164(n) })),
    effective_date: c?.effective_date ?? null,
    invoice_refs: c?.invoice_refs ?? [],
    signer_name: null,
    pressure_phrases: [],
    watermark_text: null,
    fields: [],
    extraction_path: "typed",
  };
  return { claims, account_number: acct, routing: c?.bank?.routing ?? null };
}

const stepOf = (params: Step["params"], field: Step["purpose_field"]): Step => ({ params, purpose_field: field, candidate_vendor_id: null, issued_by: "evidence_runner", planned_by: "code" });

async function attribution(ctx: RunContext): Promise<void> {
  const { s } = ctx;
  const claims = s.claims!;
  const names = [claims.claimed_name, claims.letterhead_name].filter((x): x is string => !!x);
  const steps: Step[] = [];
  if (claims.invoice_refs.length) steps.push(stepOf({ template_id: "T03", invoice_nos: claims.invoice_refs.slice(0, 10) }, "invoice_refs"));
  for (const d of [...new Set([claims.sender_domain, claims.reply_to_domain].filter((x): x is string => !!x))]) steps.push(stepOf({ template_id: "T04", domain: d }, "sender_domain"));
  const tokens = [...new Set(names.map((n) => nameToken(n)).filter((t): t is string => !!t))];
  for (const t of tokens) steps.push(stepOf({ template_id: "T04b", token: t }, "legal_name"));
  for (const n of [...new Set(names.map(nameNorm))].filter((n) => /^[A-Z0-9& ]{2,120}$/.test(n)))
    for (const t of ["T06a", "T06b", "T06c"] as const) steps.push(stepOf({ template_id: t, name_norm: n }, "legal_name"));
  const results = await ctx.C2.runMany(steps);
  const recs = (ids: string[]) => results.flatMap((r) => (r.ok && ids.includes(r.record.template_id) ? [r.record] : []));
  let cands = attribute({ claimed_names: names, t03: recs(["T03"]), t04: recs(["T04"]), t04b: recs(["T04b"]), alias: recs(["T06a", "T06b", "T06c"]) });
  for (const c of cands) {
    if (c.legal_name !== c.vendor_id) continue;
    const r = await ctx.C2.run(stepOf({ template_id: "T01", vendor_id: c.vendor_id }, "legal_name"));
    const row = r.ok ? r.record.rows[0] : undefined;
    if (row) {
      c.legal_name = str(row.legal_name) ?? c.legal_name;
      c.uei = str(row.uei);
      c.registrant_cik = str(row.registrant_cik);
    }
  }
  cands = cands.filter((c) => c.legal_name !== c.vendor_id || cands.length === 1);
  s.candidates = cands;
  if (cands.length > 1 && cands.some((c) => c.hardness === "hard") && cands.some((c) => c.signals.length === 1 && c.signals[0] === "name_fuzzy"))
    emit(ctx, { agent_name: "orchestrator", action: "intake_request", status: "success", note: "fuzzy_candidate_dropped", input_summary: "attribution", output_summary: "fuzzy candidates dropped next to a hard candidate" });
  void queriesOf;
}

function requestRow(ctx: RunContext, request_id: string): BankChangeRequestRow {
  const { s } = ctx;
  const c = s.claims!;
  const a = c.remit_address;
  const eff = c.effective_date && /^\d{4}-\d{2}-\d{2}$/.test(c.effective_date) ? c.effective_date : null;
  return {
    request_id, vendor_id: s.candidates.length === 1 ? s.candidates[0]!.vendor_id : null, candidate_vendor_ids: s.candidates.map((x) => x.vendor_id).join(","),
    claimed_name: c.claimed_name, letterhead_name: c.letterhead_name, claimed_remit_line1: a?.line1 ?? null, claimed_remit_unit: a?.unit ?? null,
    claimed_remit_city: a?.city ?? null, claimed_remit_state: a?.state ?? null, claimed_remit_zip: a?.zip ?? null,
    new_routing: c.bank?.routing ?? null, new_account_last4: s.extras.account_last4, new_account_hash: s.account_hash,
    sender_domain: c.sender_domain, reply_to_domain: c.reply_to_domain, letter_phones: s.extras.request_phones.join(","), invoice_refs: c.invoice_refs.join(","),
    received_at: s.received_at, requested_effective: eff, channel: s.extras.channel, extraction_path: c.extraction_path, extraction_model: s.extras.extraction_model,
    status: "pending", data_origin: "RUNTIME_INPUT",
  };
}

export async function intake(ctx: RunContext): Promise<IntakeResult> {
  const { s, deps } = ctx;
  const input = s.input;
  let resolved: ResolvedInput | null = null;
  let account: string | null = null;
  let fromRun: string | null = null;

  if (input.reevaluate) {
    fromRun = input.reevaluate.from_run_id;
    const p = loadState(deps.config.dirs.logs, fromRun);
    if (p.request_id !== input.reevaluate.request_id) throw new AppError("invalid_input", "That run does not belong to this request.");
    s.claims = p.claims;
    s.account_hash = p.account_hash;
    s.extras.account_last4 = p.account_last4;
    s.extras.channel = p.channel;
    s.extras.doc_ids = p.doc_ids;
    s.extras.doc_pages = p.doc_pages as never;
    s.extras.has_documents = p.doc_ids.length > 0 && p.channel !== "typed";
    s.extras.has_eml = p.channel === "email" || !!(p.eml.from_domain || p.eml.reply_to_domain);
    s.extras.extraction_model = p.extraction_model;
    s.extras.reevaluated_from = fromRun;
    s.eml = p.eml;
    s.request_id = p.request_id;
    s.received_at = p.received_at;
    s.payment_run_id = p.payment_run_id;
    emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "success", note: "reused", input_summary: `re-evaluation of ${p.request_id}`, output_summary: `claims reused from run ${fromRun}` });
  } else if (input.example_id || input.documents?.length || input.upload_id) {
    if (!deps.docs) throw new AppError("invalid_input", "Document reading is not available in this run.");
    resolved = await deps.docs.resolve(input, { signal: ctx.signal });
    const r = await readLetter(ctx, resolved);
    if (!r.ok) {
      s.extras.needs_human = r.needs_human;
      addLimitation(s, "The letter could not be read; a person must review it.");
      return { ok: false, needs_human: r.needs_human };
    }
    s.claims = r.claims;
    account = r.account_number;
    s.extras.channel = resolved.channel;
    s.extras.doc_pages = resolved.doc_pages;
    s.extras.has_documents = resolved.docs.some((d) => d.kind !== "eml_headers");
    s.extras.has_eml = !!resolved.eml_headers;
    const eml = parseEml(resolved.eml_headers);
    if (eml) {
      s.eml = { from_domain: eml.from_domain, reply_to_domain: eml.reply_to_domain, date: eml.date };
      s.claims.sender_domain = eml.from_domain ?? s.claims.sender_domain;
      s.claims.reply_to_domain = eml.reply_to_domain;
    } else if (s.claims.sender_domain || s.claims.reply_to_domain) s.eml = { from_domain: s.claims.sender_domain, reply_to_domain: s.claims.reply_to_domain, date: null };
  } else {
    const t = claimsFromTyped(input);
    s.claims = t.claims;
    account = t.account_number;
    s.extras.channel = input.channel ?? "typed";
    if (t.claims.sender_domain || t.claims.reply_to_domain) s.eml = { from_domain: t.claims.sender_domain, reply_to_domain: t.claims.reply_to_domain, date: null };
  }

  const claims = s.claims!;
  if (!fromRun) {
    if (account) {
      deps.registerTransient?.(s.run_id, account);
      const routing = claims.bank?.routing ?? "";
      s.account_hash = accountHash(routing, account);
      s.extras.account_last4 = account.slice(-4);
      if (claims.bank) claims.bank.account_last4 = account.slice(-4);
    } else s.extras.account_last4 = claims.bank?.account_last4 ?? null;
    ctx.transient.account_number = null;
  }
  s.extras.request_phones = claims.phones.map((p) => p.e164 ?? toE164(p.number)).filter((p): p is string => !!p);
  publish(ctx, "claims", { ...claims, doc_pages: s.extras.doc_pages });
  if (input.received_at) s.received_at = input.received_at;
  else if (s.eml?.date && !fromRun) s.received_at = s.eml.date;

  await attribution(ctx);

  if (!fromRun) {
    const request_id = input.request_id ?? (await deps.ports.erp.nextRequestId());
    s.request_id = request_id;
    const ins = await deps.ports.erp.insertRequest(requestRow(ctx, request_id));
    if (resolved) {
      const docs: BankChangeDocumentRow[] = resolved.docs.map((d, i) => ({
        doc_id: `DOC-${request_id}-${i + 1}`, request_id, kind: d.kind, filename: d.filename, media_type: d.media_type, sha256: d.sha256, page_count: Math.min(4, Math.max(1, d.page_count)), data_origin: "RUNTIME_INPUT",
      }));
      if (!ins.reused) await deps.ports.erp.insertDocuments(docs).catch(() => addLimitation(s, "Document records could not be saved."));
      s.extras.doc_ids = docs.map((d) => d.doc_id);
    } else s.extras.doc_ids = [];
    const rec = { request_id, received_at: s.received_at, claims, account_hash: s.account_hash, account_last4: s.extras.account_last4, candidate_vendor_ids: s.candidates.map((c) => c.vendor_id), doc_ids: s.extras.doc_ids, channel: s.extras.channel };
    await deps.ports.world.ingestRequest(rec, { kind: s.extras.channel === "typed" ? "manual" : "file", by: "intake", at: s.received_at, runId: s.run_id }).catch(() => addLimitation(s, "The request could not be written to the World Model."));
  }
  await buildExposureStep(ctx);
  const cs = s.candidates.map((c) => `${c.vendor_id} ${c.hardness} ${c.score.toFixed(2)}`).join(", ");
  emit(ctx, {
    agent_name: "orchestrator", action: "intake_request", status: "success", target_agent: "memory_gate",
    input_summary: `account hashed; raw number dropped; ${claims.invoice_refs.length} invoice ref(s), ${s.extras.request_phones.length} phone(s)`,
    output_summary: `${s.request_id} ${fromRun ? "re-evaluated" : "inserted"} (pending); candidates=[${cs || "none"}]`,
  });
  emit(ctx, { agent_name: "orchestrator", action: "handoff", status: "success", target_agent: "memory_gate", input_summary: "claims", output_summary: "claims -> memory_gate" });
  return { ok: true };
}
