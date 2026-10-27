// CLI output (04 §10.3, 01 §11.7): the three greppable `[INFO] run=… DECISION=…` lines, then the human summary block.
// Every figure comes from the GateDecision of the real run; nothing is composed here.
import type { RunEnvelope, RunErrorEnvelope } from "../schemas/api";
import { REASON_SLUGS, type GateDecision } from "../schemas/decision";
import { decisionOf } from "../api/envelope";

export const SAMPLE_BANNER =
  "SAMPLE MODE: offline data captured 2026-10-27; no live Zetaris or Nemotron calls. Decisions are computed by the same policy code.";
export const usd = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const codeLine = (d: GateDecision, klass: "red" | "cap" | "info"): string => {
  const rows = d.reason_codes.filter((c) => c.class === klass);
  if (!rows.length) return "none";
  return rows.map((c) => `${c.code} ${REASON_SLUGS[c.code]}${c.variant ? ` (${c.variant})` : ""}${c.annotation ? ` [${c.annotation}]` : ""}`).join(" · ");
};
const modelFor = (d: GateDecision, lane: "fast" | "deep"): string => d.models_used.find((m) => m.lane === lane)?.model ?? "none";

export function infoLines(env: RunEnvelope, d: GateDecision): string[] {
  const script = d.callback_scripts[0];
  const live = d.evidence_coverage;
  const dnu = script?.do_not_use.map((x) => x.number_display).join(",") || "none";
  const sweepAmount = d.sweep.findings.reduce((s, f) => s + f.amount_usd, 0);
  return [
    `[INFO] run=${env.run_id} DECISION=${d.decision} codes=${d.reason_codes.map((c) => c.code).join(",") || "none"} coverage=${live.with_live_evidence}/${live.decisive_fields} exposure=${usd(d.exposure.vendor_amount_usd)} (${d.exposure.vendor_item_count} items, ${d.exposure.payment_run_id})`,
    `[INFO] run=${env.run_id} callback=${script ? `${script.number_display} (${script.source_label})` : "none"} do_not_use=${dnu}`,
    `[INFO] run=${env.run_id} sweep=${d.sweep.findings.length} item(s) ${usd(sweepAmount)} | models: fast=${modelFor(d, "fast")} deep=${modelFor(d, "deep")} | ${env.execution_time_seconds.toFixed(1)}s | trace=${env.log_file}`,
  ];
}

export function summaryBlock(env: RunEnvelope, d: GateDecision, reviewBase: string): string[] {
  const script = d.callback_scripts[0];
  const ex = d.exposure;
  const sweep = d.sweep.findings.map((f) => `${f.item_id} ${f.vendor_name} ${usd(f.amount_usd)} ${f.rule}`).join("; ");
  const models = d.models_used.map((m) => `${m.agent} ${m.lane} ${m.model} ×${m.calls}`).join("; ");
  const lines = [
    `Probity · ${d.request_id} · ${d.resolved.vendor_name ?? "no vendor of record"}${d.resolved.vendor_id ? ` (${d.resolved.vendor_id})` : ""}`,
    `Decision: ${d.decision}   policy ${d.policy_version}   mode ${d.mode}   ${env.execution_time_seconds.toFixed(1)} s   status ${env.status}`,
    `Blocks:   ${codeLine(d, "red")}`,
    `Limits:   ${codeLine(d, "cap")}`,
    `Noted:    ${codeLine(d, "info")}`,
    `Exposure: ${ex.payment_run_id} · ${ex.vendor_item_count} items · ${usd(ex.vendor_amount_usd)} (cut-off ${ex.cutoff_local})`,
    `Call back: ${script ? `${script.number_display} · ${script.source_label} · ${d.labels.callback_notice}` : "none (no independent number was found)"}`,
  ];
  if (script?.do_not_use.length) lines.push(`Do not use: ${script.do_not_use.map((x) => `${x.number_display} (${x.reason})`).join("; ")}`);
  lines.push(
    `Sweep:    ${d.sweep.findings.length ? `${d.sweep.findings.length} other item(s) in ${d.sweep.payment_run_id} fail payment controls: ${sweep}` : `no other items in ${d.sweep.payment_run_id} fail payment controls`}`,
    `Models:   ${models || "none (no model call)"}`,
    `Trace:    ${env.log_file}`,
    `Review:   ${reviewBase.replace(/\/+$/, "")}/review/${env.run_id}`,
  );
  return lines;
}

/** The text printed after a finished run. `env` may be an error envelope: then one fixed line. */
export function renderResult(env: RunEnvelope | RunErrorEnvelope, reviewBase: string): string[] {
  if (env.status === "error") return [`[ERROR] run=${env.run_id} ${env.code}: ${env.error}${env.recoverable ? " (recoverable: try again)" : ""}`];
  const d = decisionOf(env);
  if (!d) return [`[WARN] run=${env.run_id} ${env.output.summary}`, ...(env.output.needs_human ? [`needs_human: ${env.output.needs_human}`] : [])];
  return [...infoLines(env, d), "", d.labels.synthetic_notice, ...summaryBlock(env, d, reviewBase)];
}

export const exitCodeFor = (env: RunEnvelope | RunErrorEnvelope): 0 | 1 | 3 => (env.status === "error" ? 1 : env.status === "partial_success" ? 3 : 0);
