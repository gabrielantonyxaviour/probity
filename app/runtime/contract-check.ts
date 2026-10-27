// Compile-time guard: what the run registry passes must satisfy what the orchestrator accepts (agents lane, 04 §3).
// If this file stops compiling, the two lanes' option shapes have drifted: fix the seam in contract.ts, not the call site.
import type { RunAgentOptions } from "../orchestration/run";
import type { OrchestratorOpts } from "./contract";

type Assert<T extends true> = T;
export type OptsAcceptedByOrchestrator = Assert<OrchestratorOpts extends RunAgentOptions ? true : false>;
