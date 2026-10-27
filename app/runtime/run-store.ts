// Disk side of the run registry: logs/run-<id>.json (+ state-<id>.json). Lookup order is memory, then disk, so history
// survives a restart. Files are written through the TraceWriter (masked, atomic replace).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "../trace/logger";
import type { TraceWriter } from "../trace/writer";
import { RunRecordSchema, type RunRecord } from "./run-record";
import type { PersistedRunState } from "../schemas/run-state";

export class RunStore {
  private readonly unreadable = new Set<string>();
  constructor(private readonly writer: TraceWriter) {}

  save(rec: RunRecord): void {
    this.unreadable.delete(rec.run_id);
    this.writer.run(rec.run_id, rec);
  }
  exists(runId: string): boolean {
    return existsSync(this.writer.file("run", runId));
  }
  load(runId: string): RunRecord | null {
    const f = this.writer.file("run", runId);
    if (!existsSync(f) || this.unreadable.has(runId)) return null;
    try {
      const rec = RunRecordSchema.parse(JSON.parse(readFileSync(f, "utf8")));
      if (!rec.claims) {
        const st = this.loadState(runId);
        if (st?.claims) rec.claims = st.claims;
      }
      return rec;
    } catch (err) {
      this.unreadable.add(runId); // warn once; a later save() of the same id clears it
      logger.warn({ run_id: runId, err }, "run_record_unreadable");
      return null;
    }
  }
  loadState(runId: string): PersistedRunState | null {
    const f = this.writer.file("state", runId);
    if (!existsSync(f)) return null;
    try {
      return JSON.parse(readFileSync(f, "utf8")) as PersistedRunState;
    } catch {
      return null;
    }
  }
  /** Every run id on disk (from run-*.json). */
  ids(): string[] {
    try {
      return readdirSync(this.writer.dir)
        .filter((f) => /^run-(?!state-).+\.json$/.test(f)) // run-state-<id>.json is the orchestrator's redacted dump, not a run record
        .map((f) => path.basename(f).slice(4, -5));
    } catch {
      return [];
    }
  }
}
