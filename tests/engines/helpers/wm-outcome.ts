// Process 1 of the cross-process R5 test (05 2.11 (b)): ingests S1, records fraud_confirmed for BCR-2026-0412 under its
// own session id, prints {session_id, flagged, skipped} as JSON and exits. Usage: tsx wm-outcome.ts <worldDir>
import { loadFixture, ingestScenario, newWorld, S1_RUN } from "./fixtures";

const dir = process.argv[2];
if (!dir) throw new Error("usage: wm-outcome.ts <worldDir>");
const session_id = `s-${new Date().toISOString()}`;
const w = newWorld(dir, session_id);
await ingestScenario(w, loadFixture(`s1-rows.json`), S1_RUN);
const res = await w.recordOutcome({
  request_id: "BCR-2026-0412",
  outcome: "fraud_confirmed",
  by: "Tomás Okafor (fictional)",
  session_id,
  at: "2026-10-27T12:30:00.000Z",
  run_id: "r-20261027T123000Z-00a0",
  protected: { phones_e164: ["+17039025000"], domains: ["boozallen.example"] },
});
process.stdout.write(`${JSON.stringify({ session_id, ...res })}\n`);
