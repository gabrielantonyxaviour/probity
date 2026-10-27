// Negative controls for the Examiner step, built from REAL recorded requests by one deterministic edit each (the edit is named in the file).
// The recorded runs only produced approve and mixed cases; a critic is judged by whether it blocks, so these add the cases where the right
// answer is reject or need_more. They are labelled as controls in the report and never mixed with the recorded cases.
//   npx tsx tests/eval/steps/controls.ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RecordedCall, Recording } from "./types";

const REC = path.join(process.cwd(), "tests/eval/results/steps/recorded");
const load = (id: string): Recording => JSON.parse(readFileSync(path.join(REC, `${id}.json`), "utf8")) as Recording;
type Ev = { evidence_id: string; field: string; source: string; mode: string; value: string; row_key: string; template_id: string; fetched_at: string };
type Input = { link: unknown; supporting: Ev[]; contradicting: Ev[] } & Record<string, unknown>;

function control(src: string, example: string, edit: (i: Input) => void): void {
  const base = load(src).calls.find((c) => c.action === "approve_link");
  if (!base) throw new Error(`${src} has no examiner call`);
  const user = String(base.request.messages[1]!.content);
  const [head, json] = [user.split("\n")[0]!, user.split("\n").slice(1).join("\n")];
  const input = JSON.parse(json) as Input;
  edit(input);
  const call: RecordedCall = { ...base, seq: 1, request: { ...base.request, messages: [base.request.messages[0]!, { role: "user", content: `${head}\n${JSON.stringify(input)}` }] }, production: { ...base.production, content: null, tool_calls: [] } };
  const rec: Recording = { example, recorded_at: new Date().toISOString(), seconds: 0, status: "control", decision: null, codes: [], calls: [call] };
  writeFileSync(path.join(REC, `${example}.json`), `${JSON.stringify(rec, null, 1)}\n`);
  process.stdout.write(`wrote ${example} (from ${src})\n`);
}

control("01-booz-allen-remit-change", "control-s1-name-contradicted", (i) => {
  const name = i.supporting.find((e) => e.field === "legal_name")!;
  i.supporting = [];
  i.contradicting = [{ ...name, value: "Quillan Ridge Fleet Services LLC" }];
});
control("01-booz-allen-remit-change", "control-s1-silent", (i) => { i.supporting = []; i.contradicting = []; });
control("02-saic-leidos-remit-change", "control-s2-no-shared-key", (i) => { i.supporting = i.supporting.filter((e) => e.field !== "invoice_refs"); });
