// Build docs/evidence/model-per-step.{json,md} from the recorded replays, the letter-reader eval repetitions and the live-run traces.
//   npx tsx tests/eval/steps/report.ts [--out docs/evidence]
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aggregateLetters, aggregateSteps, examinerVariant, loadRecordings, loadReplay, type Labels } from "./aggregate";
import { productionRows } from "./production";
import { renderSteps, type StepsResult } from "./render";
import { loadCases } from "../adversarial/cases";

const arg = (n: string): string | undefined => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ROOT = process.cwd();
const OUT = path.resolve(ROOT, arg("out") ?? "docs/evidence");
const R = path.join(ROOT, "tests/eval/results");
const recs = loadRecordings(path.join(R, "steps/recorded"));
const replay = loadReplay(path.join(R, "steps/replay.jsonl"));
const labels = JSON.parse(readFileSync(path.join(ROOT, "tests/eval/steps/labels.json"), "utf8")) as Labels;

const cases = loadCases({ evalLetters: true });
const truthOf = (example: string): string[] => {
  const id = example.startsWith("10-sable") ? "s10-sable-harbor" : example;
  return cases.find((c) => c.id === id)?.truth?.injection_spans?.map((s) => s.text) ?? [];
};
const steps = aggregateSteps(recs, replay, labels, truthOf);
const regenFile = path.join(R, "steps/replay-regen.jsonl");
const regen = existsSync(regenFile) ? readFileSync(regenFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { lane: "fast" | "deep"; ok: boolean; passed: boolean }) : [];
const secondOf = (lane: "fast" | "deep") => {
  const st = steps.rationale![lane];
  const firstFailed = st.answered - Number(st.quality.passes ?? 0);
  const passed = regen.filter((x) => x.lane === lane && x.passed).length;
  return { first_failed: firstFailed, second_passed: passed, second_failed: firstFailed - passed, of: st.answered };
};
const second = { fast: secondOf("fast"), deep: secondOf("deep") };
const letterDirs = existsSync(path.join(R, "letters")) ? readdirSync(path.join(R, "letters")).sort().map((d) => path.join(R, "letters", d)) : [];
const letter = aggregateLetters(letterDirs);

const liveRuns = new Set(readdirSync(path.join(ROOT, "logs")).filter((f) => /^run-r-.*\.json$/.test(f)).flatMap((f) => { try { const j = JSON.parse(readFileSync(path.join(ROOT, "logs", f), "utf8")) as { run_id: string; mode: string }; return j.mode === "live" ? [j.run_id] : []; } catch { return []; } }));
const production = productionRows(path.join(ROOT, "logs"), liveRuns);

const prodLane = (agent: string, test: (c: { action: string; request: { response_schema?: { name: string } } }) => boolean): string => {
  const lanes = new Set([...recs.values()].flatMap((r) => r.calls.filter((c) => c.agent === agent && test(c)).map((c) => c.lane)));
  return [...lanes].join("/");
};
const hash = (f: string): string => createHash("sha256").update(readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 12);
let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* no git */ }
const result = {
  eval: "model-per-step", generated_at: new Date().toISOString(), base_commit: commit,
  pins: { fast: "nvidia/nemotron-3.5-lightning-30b-a3b", deep: "nvidia/nemotron-3-ultra-550b-a55b" },
  probity_uses: {
    letter: prodLane("letter_reader", (c) => c.request.response_schema?.name !== "injection_review"), scout: prodLane("registry_scout", () => true),
    examiner: prodLane("identity_examiner", (c) => c.action === "approve_link"), conflicts: prodLane("identity_examiner", (c) => c.action === "raise_conflict"),
    rationale: prodLane("gate_officer", () => true), review: prodLane("letter_reader", (c) => c.request.response_schema?.name === "injection_review"),
  },
  prompts_sha256_12: Object.fromEntries(["letter_reader", "letter_reader_visual", "registry_scout", "identity_examiner", "describe_conflicts", "gate_officer", "injection_review"].filter((p) => existsSync(path.join(ROOT, `app/prompts/${p}.md`))).map((p) => [p, hash(`app/prompts/${p}.md`)])),
  recordings: [...recs.values()].map((r) => ({ example: r.example, status: r.status, decision: r.decision, codes: r.codes, calls: r.calls.length })),
  replay: { calls: replay.length, infrastructure_failures_excluded: existsSync(path.join(R, "steps/replay-unreachable.jsonl")) ? readFileSync(path.join(R, "steps/replay-unreachable.jsonl"), "utf8").split("\n").filter(Boolean).length : 0 },
  steps: { letter, ...steps, rationale_second_attempt: second, examiner_thinking_off: examinerVariant(recs, loadReplay(path.join(R, "steps/replay-nothink.jsonl")), labels) }, production_runs: { live_runs: liveRuns.size, rows: production },
  examiner_labels: labels,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "model-per-step.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(OUT, "model-per-step.md"), renderSteps(result as unknown as StepsResult));
// The raw per-call records behind every number (no prompts, no secrets): replayed calls, the thinking-off and second-attempt calls, letter reads, masked receipts of the letter reads.
for (const [from, to] of [["steps/replay.jsonl", "model-per-step-calls.jsonl"], ["steps/replay-nothink.jsonl", "model-per-step-calls-thinking-off.jsonl"], ["steps/replay-regen.jsonl", "model-per-step-rationale-second-attempt.jsonl"]] as const)
  if (existsSync(path.join(R, from))) copyFileSync(path.join(R, from), path.join(OUT, to));
const reads = letterDirs.flatMap((d, i) => { const f = path.join(d, "nemotron-eval.json"); return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { calls: unknown[] }).calls.map((c) => JSON.stringify({ run: i + 1, ...(c as object) })) : []; });
writeFileSync(path.join(OUT, "model-per-step-letter-reads.jsonl"), `${reads.join("\n")}\n`);
writeFileSync(path.join(OUT, "model-per-step-letter-receipts.jsonl"), letterDirs.flatMap((d) => { const f = path.join(d, "nemotron-eval-receipts.jsonl"); return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : []; }).join("\n") + "\n");
process.stdout.write(`wrote ${path.relative(ROOT, OUT)}/model-per-step.{json,md} and the per-call files\n`);
