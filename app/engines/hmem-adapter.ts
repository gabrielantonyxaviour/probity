// MemoryPort (E2 H-MEM, COULD). Disabled unless ENABLE_HMEM=true: recall returns [], note and feedback writes throw
// `hmem_disabled` (routes answer 503). The enabled path loads the vendored engine through a dynamic import so removing
// `app/engines/hmem/` (the 16:00Z cut) leaves this shell, the type and `createMemory` intact.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AppError } from "../schemas/errors";
import type { MemoryPort, WorldModelPort } from "../schemas/engines";

export type { MemoryPort } from "../schemas/engines";
export type MemoryEnv = {
  ENABLE_HMEM?: boolean | undefined;
  HMEM_DIR?: string | undefined;
  SAMPLE_MODE?: boolean | undefined;
  WORLD_DIR?: string | undefined;
  session_id?: string;
  kind?: "api" | "cli";
  api_url?: string | null;
  /** Fixed clock for tests. */
  clock?: () => number;
  /** The world adapter of the same process: one lock covers both stores, so open/close delegate to it. */
  world?: Pick<WorldModelPort, "open" | "close">;
};

const disabled = (): AppError =>
  new AppError("hmem_disabled", "Analyst notes are not enabled in this build.", { httpStatus: 503 });

export class DisabledMemory implements MemoryPort {
  readonly enabled = false;
  async open(): Promise<void> {}
  async close(): Promise<void> {}
  async addNote(): Promise<never> {
    throw disabled();
  }
  /** The outcome summary is a side effect of /outcomes, not a user write: disabled means nothing is stored. */
  async addOutcome(): Promise<null> {
    return null;
  }
  async feedback(): Promise<never> {
    throw disabled();
  }
  async recallForVendor(): Promise<{ memories: []; context: null }> {
    return { memories: [], context: null };
  }
  async ledger(): Promise<[]> {
    return [];
  }
  async list(): Promise<[]> {
    return [];
  }
}

/** Loads the enabled implementation on first use, so removing `app/engines/hmem/` (the 16:00Z cut) breaks nothing at import. */
class LazyMemory implements MemoryPort {
  readonly enabled = true;
  private impl: Promise<MemoryPort> | null = null;
  constructor(private env: MemoryEnv) {}
  private get(): Promise<MemoryPort> {
    return (this.impl ??= import("./hmem-enabled.ts").then((m) => new m.EnabledMemory(this.env)));
  }
  open = () => this.get().then((m) => m.open());
  close = () => this.get().then((m) => m.close());
  addNote: MemoryPort["addNote"] = (n) => this.get().then((m) => m.addNote(n));
  addOutcome: MemoryPort["addOutcome"] = (o) => this.get().then((m) => m.addOutcome(o));
  feedback: MemoryPort["feedback"] = (id, kind, by) => this.get().then((m) => m.feedback(id, kind, by));
  recallForVendor: MemoryPort["recallForVendor"] = (v) => this.get().then((m) => m.recallForVendor(v));
  ledger: MemoryPort["ledger"] = (id) => this.get().then((m) => m.ledger(id));
  list: MemoryPort["list"] = (vid) => this.get().then((m) => m.list(vid));
}

const engineExists = (): boolean => existsSync(fileURLToPath(new URL("./hmem/index.ts", import.meta.url)));

/** Disabled unless ENABLE_HMEM=true and the vendored engine is present (SW8 go). */
export function createMemory(env: MemoryEnv = {}): MemoryPort {
  return env.ENABLE_HMEM && engineExists() ? new LazyMemory(env) : new DisabledMemory();
}
