// Per-run call budgets and the circuit breaker (05 §4.8, §4.9). Caps are counted when a call is sent: retries and repairs
// count, parameter negotiation does not. Vision is 0. The breaker trips after two consecutive timeout/unreachable results
// and holds for the rest of that run; the next run probes again.
import type { Lane } from "../../schemas/trace";

export const RUN_CAPS: Record<Lane, number> = { fast: 20, deep: 8, vision: 0 };
const BREAKER_AFTER = 2;

type RunLimits = { n: number; used: Record<Lane, number>; consecutive: number; open: boolean };

export class Limits {
  private readonly runs = new Map<string, RunLimits>();

  private get(runId: string): RunLimits {
    let r = this.runs.get(runId);
    if (!r) {
      r = { n: 0, used: { fast: 0, deep: 0, vision: 0 }, consecutive: 0, open: false };
      this.runs.set(runId, r);
      if (this.runs.size > 500) this.runs.delete(this.runs.keys().next().value as string);
    }
    return r;
  }
  /** Take one send from the lane's budget and return the run's call counter `n`; null when the budget is spent. */
  consume(runId: string, lane: Lane): number | null {
    const r = this.get(runId);
    if (r.used[lane] >= RUN_CAPS[lane]) return null;
    r.used[lane] += 1;
    r.n += 1;
    return r.n;
  }
  used(runId: string, lane: Lane): number {
    return this.get(runId).used[lane];
  }
  isOpen(runId: string): boolean {
    return this.get(runId).open;
  }
  /** Record a transport-level outcome. Returns true when this failure opened the breaker. */
  record(runId: string, outcome: "ok" | "transport_failure" | "other_failure"): boolean {
    const r = this.get(runId);
    if (outcome === "ok") r.consecutive = 0;
    else if (outcome === "transport_failure") {
      r.consecutive += 1;
      if (r.consecutive >= BREAKER_AFTER && !r.open) {
        r.open = true;
        return true;
      }
    }
    return false;
  }
}
