// J3: re-evaluate a request after a call-back (REV-22). No model call for claims; C4 is evaluated on the stored channel.
import type { RunEnvelope, RunErrorEnvelope } from "../schemas/api";
import { runAgent, type RunAgentOptions } from "./run";

export function reevaluate(a: { request_id: string; from_run_id: string }, opts: RunAgentOptions): Promise<RunEnvelope | RunErrorEnvelope> {
  return runAgent({ reevaluate: { request_id: a.request_id, from_run_id: a.from_run_id } }, opts);
}
