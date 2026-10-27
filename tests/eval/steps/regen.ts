// Rationale second attempt, exactly as app/agents/gate-officer/rationale.ts builds it: every first attempt that failed the number check or the
// grounding guard is sent back on the same lane with the failure list. Output: tests/eval/results/steps/replay-regen.jsonl.
//   npx tsx tests/eval/steps/regen.ts
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../../../app/config/env";
import { createModelClient } from "../../../app/adapters/nightshift";
import type { ChatMessage, ChatRequest } from "../../../app/schemas/models";
import { cleanRationale } from "../../../app/policy/number-check";
import { checkGrounded } from "../../../app/policy/rationale-guard";
import { lastJsonObject } from "../../../app/orchestration/model";
import { loadRecordings, loadReplay } from "./aggregate";
import type { RegenRecord } from "./types";

const R = path.join(process.cwd(), "tests/eval/results/steps");
const OUT = path.join(R, "replay-regen.jsonl");
const cfg = loadConfig();
const models = createModelClient(cfg);
if ((await models.status()).status !== "online") throw new Error("Nightshift is not online.");
const recs = loadRecordings(path.join(R, "recorded"));
const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l) as RegenRecord; return `${r.id}|${r.lane}|${r.rep}`; }) : []);
const text = (m: ChatMessage): string => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text).join("\n"));
const textOf = (content: string | null): string | null => { const j = content ? (lastJsonObject(content) as { text?: unknown } | null) : null; return typeof j?.text === "string" ? cleanRationale(j.text) : null; };

let n = 0;
for (const r of loadReplay(path.join(R, "replay.jsonl")).filter((x) => x.step === "rationale" && x.ok)) {
  if (done.has(`${r.id}|${r.lane}|${r.rep}`)) continue;
  const call = recs.get(r.example)!.calls.find((c) => c.seq === r.seq)!;
  const input = JSON.parse(text(call.request.messages[1]!)) as Parameters<typeof checkGrounded>[1];
  const first = textOf(r.content);
  const c1 = first ? checkGrounded(first, input) : null;
  if (!first || !c1 || c1.ok) continue;
  const messages: ChatMessage[] = [...call.request.messages, { role: "assistant", content: JSON.stringify({ text: first }) }, { role: "user", content: `That rationale failed these checks: ${c1.failures.join("; ")}. Write it again in 3 to 5 plain sentences that state only what the input says, copying values exactly.` }];
  const req: ChatRequest = { ...call.request, messages, lane: r.lane, run: { run_id: `rg${Date.now().toString(36)}${n++}`, round: 0, call_index: 1 } };
  let rec: RegenRecord;
  try {
    const res = await models.chat(req);
    const t = textOf(res.content);
    const c2 = t ? checkGrounded(t, input) : null;
    rec = { id: r.id, lane: r.lane, rep: r.rep, ok: true, passed: !!c2?.ok, failures: c2?.failures.slice(0, 3) ?? ["schema"], latency_ms: res.latency_ms, egress: res.receipt?.receipt?.egress?.destination ?? null };
  } catch (e) {
    rec = { id: r.id, lane: r.lane, rep: r.rep, ok: false, passed: false, failures: [(e as { code?: string }).code ?? "error"], latency_ms: 0, egress: null };
  }
  appendFileSync(OUT, `${JSON.stringify(rec)}\n`);
  process.stdout.write(`${r.id} ${r.lane} rep${r.rep}: second attempt ${rec.ok ? (rec.passed ? "passed" : "failed again") : "call failed"}\n`);
}
process.exit(0);
