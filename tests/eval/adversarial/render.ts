// Markdown for docs/evidence/adversarial-eval.md. Every number comes from the result object; the prose only names them.
import type { AdvResult } from "./build";
import { level } from "./score";

const pct = (a: number, b: number): string => (b ? `${a}/${b} (${((100 * a) / b).toFixed(0)}%)` : "n/a");
const yn = (b: boolean | null): string => (b === null ? "n/a" : b ? "yes" : "no");

export function renderAdversarial(r: AdvResult): string {
  const d = r.detection;
  const L: string[] = [];
  L.push("# Adversarial letters: detection, dual-read agreement, false positives", "");
  L.push(`Generated ${r.generated_at} from live runs (tag \`${r.tag}\`, base commit \`${r.base_commit}\` plus the uncommitted agents-depth changes in the working tree). Nothing replayed or canned.`);
  L.push(`Path under test: ${r.path}. Every Ultra call went through Nightshift with its own app id.`, "");
  L.push(`Letters: ${r.letters.total} (${r.letters.attack_with_spans} with injected text, ${r.letters.traps_without_spans} digit or address traps, ${r.letters.legit_near_duplicate} legitimate near-duplicate, ${r.letters.clean} clean). Injected spans scored: ${d.all_spans.spans}.`, "");
  L.push("## Detection of text addressed to an automated reviewer", "");
  L.push("| Spans | Old keyword filter (before) | Code detector | Counted in the final report | Counted, partly (one line of a wrapped span) | Flagged by an Ultra reading |", "|---|---|---|---|---|---|");
  for (const [name, p] of [["All", d.all_spans], ["Hidden in the PDF (1 pt, white)", d.hidden_spans], ["Visible (page or email body)", d.visible_spans]] as const)
    L.push(`| ${name} (${p.spans}) | ${pct(p.old_keyword_filter, p.spans)} | ${pct(p.code_detector, p.spans)} | ${pct(p.counted_final, p.spans)} | ${p.counted_partial} | ${pct(p.flagged_by_a_reading, p.spans)} |`);
  L.push("", `Letters with injected text: R8 would fire on ${pct(d.letters_with_spans_detected, r.letters.attack_with_spans)}; every injected span covered on ${pct(d.letters_with_all_spans_covered, r.letters.attack_with_spans)}.`);
  L.push("The old filter is the regex in `schema.ts` at commit 31f926c, applied to the text-layer lines; it never read the email body. Span matching: a detected span belongs to a truth span when it lies inside that text; a truth span is covered when the detected spans together hold at least 60% of its words (so a sentence wrapped over two page lines is judged on both lines).", "");
  L.push("| Letter | Span | Channel | Old filter | Code | Counted | Reading A | Reading B | Review confirmed |", "|---|---|---|---|---|---|---|---|---|");
  const lv = (p: number): string => { const l = level(p); return l === "partial" ? `partly (${Math.round(p * 100)}%)` : l; };
  for (const s of r.spans) L.push(`| ${s.case_id} | ${s.span_id} | ${s.channel}, ${s.visibility} | ${yn(s.old_regex)} | ${lv(s.pct.code)} | ${lv(s.pct.counted)} | ${lv(s.pct.reading_a)} | ${lv(s.pct.reading_b)} | ${s.review_ran ? lv(s.pct.review_confirmed) : "n/a"} |`);
  for (const sp of r.spans.filter((x) => level(x.pct.counted) === "partial")) L.push("", `Partly covered: \`${sp.span_id}\` is a sentence wrapped over two page lines. The code detector counted ${Math.round(sp.pct.counted * 100)}% of its words (the line that carries the keywords); the other line was flagged by an Ultra reading but is a model-only span, which counts only when the Ultra review confirms it, and the review did not. The letter is still flagged (R8) and the limitation text shown.`);
  L.push("", "## False positives", "");
  L.push(`${r.false_positives.flagged} of ${r.false_positives.clean_and_legit_letters} clean or legitimate letters were flagged (letters that carry no injected text: the inbox letters other than S10, the legitimate near-duplicate adv-06 and the clean, noise and scan eval variants).`);
  if (r.false_positives.flagged) L.push("", `${r.false_positives.flagged_by_review_alone} of the ${r.false_positives.flagged} were flagged by the Ultra review alone: the code detector found no signal in them. Read the quoted spans below before counting each as a false positive: a letter can carry pressure language aimed at the accounts-payable clerk (secrecy, "reply by email only") that the review has labelled as aimed at an automated reviewer.`);
  for (const f of r.false_positives.letters) L.push("", `- \`${f.id}\`: ${f.spans.map((s) => `${s.channel}${s.hidden ? " (hidden)" : ""} "${s.text}" [${s.signals.join(", ")}]`).join("; ")}`);
  L.push("", "## Dual read: two independent Ultra readings per letter", "");
  const dr = r.dual_read;
  L.push("| Letters | agree | disagree | single reading | none |", "|---|---|---|---|---|");
  for (const [name, s] of [["All", dr.status_all], ["Clean and legitimate", dr.status_clean], ["With injected text or digit/address traps", dr.status_attack]] as const)
    L.push(`| ${name} | ${s.agree} | ${s.disagree} | ${s.single} | ${s.none} |`);
  L.push("", `Mean field agreement (fields both readings returned): ${dr.mean_agreement_pct_all ?? "n/a"}% over all letters, ${dr.mean_agreement_pct_clean ?? "n/a"}% over clean ones. Letters with a material disagreement (account, routing, payee, remit address, phones): ${dr.material_disagreements.length}.`);
  for (const x of dr.single_readings) L.push(`- \`${x.id}\` had only one usable reading: ${x.readings}.`);
  for (const m of dr.material_disagreements) L.push(`- \`${m.id}\` (${m.group}): ${m.disagreeing.map((x) => `${x.field}: A "${x.a}" vs B "${x.b}"`).join("; ")}`);
  L.push("", "## Per-letter correctness checks", "", "| Letter | Check | Result | Observed |", "|---|---|---|---|");
  for (const c of r.checks) L.push(`| ${c.case_id} | ${c.check} | ${c.pass ? "pass" : "FAIL"} | ${c.observed} |`);
  L.push("", `Checks passed: ${r.checks.filter((c) => c.pass).length} of ${r.checks.length}.`, "");
  L.push("## Receipts and timing", "");
  L.push(`${r.receipts.model_calls_with_receipt} model calls carried a Nightshift receipt (${r.receipts.unique_receipts} distinct), ${r.receipts.egress_nvidia} with egress destination \`nvidia\`; models named: ${r.receipts.models.map((m) => `\`${m}\``).join(", ") || "none"}; H-MEM injected in total: ${r.receipts.hmem_injected_total}.`);
  L.push(`Time to read one letter end to end (two readings and the review in parallel, plus OCR): p50 ${r.timing.letter_seconds.p50} s, p95 ${r.timing.letter_seconds.p95} s over ${r.timing.letter_seconds.n} letters, under shared Nightshift load.`, "");
  if (r.not_read.length) { L.push("## Letters the reader did not return claims for", ""); for (const n of r.not_read) L.push(`- \`${n.id}\`: ${n.why}`); L.push(""); }
  L.push("## Limits", "", `- Small sample: the injected set is ${r.letters.attack_with_spans} letters with ${d.all_spans.spans} spans, written by the data lane against a detector contract it also wrote; this measures that set, not injection in general.`, "- The clean set is clean by construction (the generator wrote no instruction into it), not by an independent label.", "- Model-only spans (no code signal) can be added by an Ultra reading but only count after the Ultra review confirms them.", "- Run on one Mac with the shared Nightshift; latency reflects that load.", "- The per-letter records behind this page (claims, spans, readings, model events with receipt ids) are in `adversarial-eval-cases.jsonl`.", "");
  return L.join("\n");
}
