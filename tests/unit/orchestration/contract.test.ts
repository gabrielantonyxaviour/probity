// The agents lane and the platform lane meet at app/runtime/contract.ts: keep the two shapes assignable (type-level) and
// the exports the platform loads present (runtime).
import { describe, expect, it } from "vitest";
import type { Config } from "../../../app/config/env";
import type { OrchestratorOpts } from "../../../app/runtime/contract";
import * as run from "../../../app/orchestration/run";
import type { AgentConfig } from "../../../app/orchestration/ctx";
import type { RunAgentOptions } from "../../../app/orchestration/run";

describe("platform contract", () => {
  it("Config satisfies AgentConfig and OrchestratorOpts satisfies RunAgentOptions", () => {
    const cfg = (c: Config): AgentConfig => c;
    const opts = (o: OrchestratorOpts): RunAgentOptions => o;
    expect(typeof cfg).toBe("function");
    expect(typeof opts).toBe("function");
  });
  it("run.ts exports the four names the platform loads", () => {
    for (const k of ["runAgent", "cancelRun", "getRunState", "reevaluate"] as const) expect(typeof run[k]).toBe("function");
  });
});
