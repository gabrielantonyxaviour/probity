// WorldModelPort over the vendored engine (05 2.3, 2.8). One instance per process; writes happen inside open()/close()
// (the cross-process lock, held per run or per write, never for the process life); reads reload the store when another
// process changed the file (mtime/size) and this process does not hold the lock.
import path from "node:path";
import { WorldModel, type Fact } from "./world-model/index.ts";
import type {
  KnownBadHit,
  LinkStatusRow,
  PhoneWindowRow,
  Prov,
  RequestRecord,
  TemplateRows,
  WorldModelPort,
  WriteSummary,
} from "../schemas/engines";
import type { GraphPayload } from "../schemas/graph";
import { AppError, ERROR_TEXT } from "../schemas/errors";
import { logger } from "../trace/logger";
import {
  acquireStateLock,
  fileSignature,
  sigChanged,
  sleepSync,
  StateLockedError,
  type FileSig,
  type LockMeta,
} from "./state-lock";
import { EventIndex, RunClock, Writer } from "./wm-writer";
import { maybeWipeSample, resolveWorldDir, type EngineEnv } from "./wm-env";
import { proposeLinkOp, recordVerdictOp } from "./wm-links";
import { ingestBatch, ingestRequest, type CurrentRequest, type RequestRecordX, type TemplateRowsX } from "./wm-ingest";
import { recordOutcome, type OutcomeResult, type OutcomeWriteX } from "./wm-outcome";
import { knownBad, linkFacts, linkStatus, vendorPhoneHistory, vendorPhonesAt, graphFor } from "./wm-read";
import type { GraphOpts } from "./wm-graph";
import type { ExaminerVerdict, LinkProposal, LinkType } from "../schemas/messages";

export type {
  KnownBadHit,
  LinkStatusRow,
  OutcomeWrite,
  PhoneWindowRow,
  Prov,
  RequestRecord,
  TemplateRows,
  WorldModelPort,
  WriteSummary,
} from "../schemas/engines";
export type { GraphFlag, GraphPayload } from "../schemas/graph";
export type { GraphOpts } from "./wm-graph";
export { resolveWorldDir, samplePath, type EngineEnv } from "./wm-env";
export type { OutcomeWriteX, RequestRecordX, TemplateRowsX };

export function createWorld(env: EngineEnv = {}): WorldModelAdapter {
  const dir = resolveWorldDir(env);
  maybeWipeSample(env, dir);
  return new WorldModelAdapter(dir, { session_id: env.session_id, kind: env.kind, api_url: env.api_url });
}

const wrap = (e: unknown): Error => {
  if (e instanceof AppError) return e;
  logger.error({ err: e instanceof Error ? e.message : String(e) }, "world model operation failed");
  return new AppError("world_model_unavailable", ERROR_TEXT.world_model_unavailable, { cause: e });
};

export class WorldModelAdapter implements WorldModelPort {
  private world: WorldModel | null = null;
  private writer: Writer | null = null;
  private sig: FileSig = null;
  private depth = 0;
  private release: (() => void) | null = null;
  private clock = new RunClock();
  private reqs = new Map<string, CurrentRequest>();
  readonly file: string;

  constructor(
    readonly dir: string,
    private meta: LockMeta = {},
  ) {
    this.file = path.join(dir, ".world", "probity.json");
  }

  // ---- lifecycle ----------------------------------------------------------------------------------------------
  /** `strict` (writers) throws when the store cannot be read; a reader keeps its last good snapshot and retries next call. */
  private load(strict: boolean): void {
    let last: unknown;
    for (let i = 0; i < 5; i++) {
      try {
        // a reader may catch the vendored store mid-rewrite; retry briefly
        this.world = new WorldModel({
          namespace: "probity",
          storage: "local",
          directory: this.dir,
          resolver: { autoMergeAt: 1.01, reviewBand: [0.82, 1.01] },
        });
        this.writer = new Writer(this.world, new EventIndex(this.world));
        this.sig = fileSignature(this.file);
        return;
      } catch (e) {
        last = e;
        sleepSync(40);
      }
    }
    if (!strict && this.world) {
      logger.warn({ err: last instanceof Error ? last.message : String(last) }, "world model reload deferred");
      return;
    }
    throw wrap(last);
  }

  private fresh(): Writer {
    if (!this.world || (this.depth === 0 && sigChanged(this.sig, fileSignature(this.file)))) this.load(!this.world);
    return this.writer!;
  }

  async open(): Promise<void> {
    if (this.depth > 0) {
      this.depth += 1;
      return;
    }
    const release = await acquireStateLock(this.dir, this.meta);
    try {
      if (!this.world || sigChanged(this.sig, fileSignature(this.file))) this.load(true);
    } catch (e) {
      release();
      throw e;
    }
    this.release = release;
    this.depth = 1;
  }

  async close(): Promise<void> {
    if (this.depth === 0) return;
    this.sig = fileSignature(this.file);
    this.depth -= 1;
    if (this.depth === 0) {
      this.release?.();
      this.release = null;
    }
  }

  private async write<T>(fn: (w: Writer) => Promise<T>): Promise<T> {
    const own = this.depth === 0;
    if (own) await this.open();
    try {
      return await fn(this.writer!);
    } catch (e) {
      throw e instanceof StateLockedError ? e : wrap(e);
    } finally {
      if (own) await this.close();
      else this.sig = fileSignature(this.file);
    }
  }

  // ---- writes -------------------------------------------------------------------------------------------------
  ingestRequest(req: RequestRecord, prov: Prov): Promise<WriteSummary> {
    return this.write(async (w) => {
      w.resetSummary();
      this.reqs.set(prov.runId, await ingestRequest(w, req as RequestRecordX, prov.runId));
      return w.resetSummary();
    });
  }

  ingestRows(batch: TemplateRows[], runId: string): Promise<WriteSummary> {
    return this.write(async (w) => {
      w.resetSummary();
      for (const b of batch as TemplateRowsX[]) {
        const prov: Prov = {
          kind: "api",
          by: "evidence_runner",
          at: b.fetched_at,
          url: `zetaris://${b.template_id}/${b.query_id}`,
          checksum: b.row_hash,
          runId,
        };
        const notes: string[] = [];
        await ingestBatch({ w, runId, batch: b, prov, req: this.reqs.get(runId) ?? null, notes });
        for (const n of notes) logger.debug({ template: b.template_id, note: n }, "world model ingest note");
      }
      return w.resetSummary();
    });
  }

  proposeLink(p: LinkProposal & { link_type: LinkType; request_id: string }, prov: Prov): Promise<void> {
    return this.write((w) => proposeLinkOp(w, this.clock, p, prov));
  }

  recordVerdict(
    v: ExaminerVerdict & { link_type: LinkType; request_id: string; from: string; to: string; confidence: number },
    prov: Prov,
  ): Promise<void> {
    return this.write((w) => recordVerdictOp(w, this.clock, v, prov));
  }

  recordOutcome(o: OutcomeWriteX): Promise<OutcomeResult> {
    return this.write((w) => recordOutcome(w, o));
  }

  recordDqInvalid(entityId: string, rule: "DQ4" | "DQ5" | "DQ6", prov: Prov): Promise<void> {
    const detail = {
      DQ4: "registry address missing",
      DQ5: "EIN is the placeholder 000000000",
      DQ6: "state of incorporation missing",
    }[rule];
    return this.write((w) =>
      w.factOnce(entityId, `dq_invalid:${rule}`, { rule, query_id: prov.url?.split("/").pop() ?? null, detail }, prov),
    );
  }

  // ---- reads --------------------------------------------------------------------------------------------------
  knownBad(a: { account_hash: string | null; phones_e164: string[]; domains: string[] }): KnownBadHit[] {
    return knownBad(this.fresh(), a);
  }
  vendorPhonesAt(vendorId: string, atIso: string): PhoneWindowRow[] {
    return vendorPhonesAt(this.fresh(), vendorId, atIso);
  }
  vendorPhoneHistory(vendorId: string): PhoneWindowRow[] {
    return vendorPhoneHistory(this.fresh(), vendorId);
  }
  linkStatus(requestId: string): LinkStatusRow[] {
    return linkStatus(this.fresh(), requestId);
  }
  graphFor(requestId: string, opts?: GraphOpts): GraphPayload {
    return graphFor(this.fresh(), requestId, opts);
  }
  /** Latest fact by assertedAt, ties by event seq (W8 guard). */
  latestFact(about: string, predicate: string): Fact | undefined {
    return this.fresh().latestFact(about, predicate);
  }
  stateShapeCanonical(): string {
    this.fresh();
    return this.world!.stateShapeCanonical();
  }
  worldSeq(): number {
    return this.fresh().world.events().length;
  }
  /** Event count for tests and the idempotency claim. */
  eventCount(): number {
    return this.worldSeq();
  }
  linkFactsFor(requestId: string): ReturnType<typeof linkFacts> {
    return linkFacts(this.fresh(), requestId);
  }
}
