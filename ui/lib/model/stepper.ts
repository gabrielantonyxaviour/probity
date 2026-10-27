// Stepper state for the running Decision card (01 section 7.1.2, 8.2). Derived from the stage and trace actions only.
import type { StageName } from "@schemas/run-state";
import type { TraceEvent } from "../contracts";
import { STAGE_TO_STEP, STEPS, stepForAction } from "../labels-trace";
import type { RunStatus } from "../run-store";

export type StepState = "pending" | "running" | "done" | "skipped";
export type StepInfo = { index: number; label: string; state: StepState; retries: number; sub: string | null };

export function currentStep(trace: TraceEvent[], stage: StageName | null): number {
  if (stage) return STAGE_TO_STEP[stage] ?? 0;
  for (let i = trace.length - 1; i >= 0; i--) {
    const s = stepForAction(trace[i].action, trace[i].round);
    if (s >= 0) return s;
  }
  return 0;
}

export function maxRound(trace: TraceEvent[], stageRound = 0): number {
  return trace.reduce((m, e) => Math.max(m, e.round), stageRound);
}

export function buildSteps(input: {
  trace: TraceEvent[];
  stage: StageName | null;
  stageRound: number;
  status: RunStatus;
  typed: boolean;
  roundOf: (n: number) => string;
}): StepInfo[] {
  const { trace, stage, status } = input;
  const reached = new Set<number>();
  const retries = new Map<number, number>();
  for (const e of trace) {
    const s = stepForAction(e.action, e.round);
    if (s < 0) continue;
    reached.add(s);
    if (e.action === "retry") retries.set(s, (retries.get(s) ?? 0) + 1);
  }
  const running = status === "running";
  const cur = running ? currentStep(trace, stage) : -1;
  if (running) reached.add(cur);
  const round = maxRound(trace, input.stageRound);
  return STEPS.map((label, index) => {
    let state: StepState;
    if (running) {
      if (index === cur) state = "running";
      else if (index < cur) state = index === 0 && input.typed ? "skipped" : "done";
      else state = reached.has(index) ? "done" : "pending";
    } else {
      state = reached.has(index) ? "done" : "skipped";
    }
    return {
      index,
      label,
      state,
      retries: retries.get(index) ?? 0,
      sub: index === 5 && round >= 1 ? input.roundOf(Math.min(round, 2)) : null,
    };
  });
}
