// E2 H-MEM, enabled path (05 3.2-3.6): analyst notes, outcome summaries, trust-ledger feedback, the deterministic recall
// gate. Loaded only by hmem-adapter's dynamic import; the 16:00Z cut deletes this file with app/engines/hmem/.
import os from "node:os";
import path from "node:path";
import { HMEM, cosine, type MemoryRecord } from "./hmem/index.ts";
import { AppError } from "../schemas/errors";
import type { LedgerRow, MemoryNote, MemoryPort, MemoryRecall, NoteInput, OutcomeWrite } from "../schemas/engines";
import { acquireStateLock, fileSignature, sigChanged, type FileSig, type LockMeta } from "./state-lock";
import { resolveWorldDir } from "./wm-env";
import type { MemoryEnv } from "./hmem-adapter";
import { noteResult, tagValue, textOf, isActive, subjectPrefix } from "./hmem-notes";

const CORRECTION = /\b(actually|instead|no longer|not anymore|changed to|correction)\b/i;
const EFFECT = "Address variance accepted as known benign; skipped 1 discovery round.";
type OutcomeX = OutcomeWrite & {
  vendor_id: string | null;
  legal_name: string | null;
  sender_domain?: string | null;
  phones?: string[];
};

export class EnabledMemory implements MemoryPort {
  readonly enabled = true;
  private hmem: HMEM | null = null;
  private sig: FileSig = null;
  private depth = 0;
  private release: (() => void) | null = null;
  private readonly dir: string;
  private readonly lockDir: string;
  private readonly clock: () => number;

  constructor(private env: MemoryEnv) {
    const sampleDefault = env.SAMPLE_MODE && !env.WORLD_DIR && (!env.HMEM_DIR || env.HMEM_DIR === "data/hmem");
    this.dir = sampleDefault ? path.join(os.tmpdir(), "probity-sample", "hmem") : (env.HMEM_DIR ?? "data/hmem");
    this.lockDir = resolveWorldDir(env);
    this.clock = env.clock ?? Date.now;
  }

  private get meta(): LockMeta {
    return { session_id: this.env.session_id, kind: this.env.kind, api_url: this.env.api_url };
  }
  private stateFile = () => path.join(this.dir, "state.json");

  private engine(): HMEM {
    if (!this.hmem || (this.depth === 0 && sigChanged(this.sig, fileSignature(this.stateFile())))) {
      this.hmem = new HMEM({ persistDir: this.dir, actor: "probity", clock: this.clock });
      this.sig = fileSignature(this.stateFile());
    }
    return this.hmem;
  }

  /** One lock covers the World Model and H-MEM: with a world adapter given, open/close delegate to it. */
  async open(): Promise<void> {
    if (this.env.world) return this.env.world.open();
    if (this.depth++ > 0) return;
    try {
      this.release = await acquireStateLock(this.lockDir, this.meta);
    } catch (e) {
      this.depth = 0;
      throw e;
    }
    this.hmem = null; // reload inside the lock
  }
  async close(): Promise<void> {
    if (this.env.world) return this.env.world.close();
    if (this.depth === 0) return;
    this.sig = fileSignature(this.stateFile());
    if (--this.depth === 0) {
      this.release?.();
      this.release = null;
    }
  }
  private async write<T>(fn: (h: HMEM) => T): Promise<T> {
    await this.open();
    try {
      const out = fn(this.engine());
      this.sig = fileSignature(this.stateFile());
      return out;
    } finally {
      await this.close();
    }
  }

  addNote(n: NoteInput): ReturnType<MemoryPort["addNote"]> {
    return this.write((h) => {
      const content = `${subjectPrefix(n.vendor_id, n.legal_name, n.uei, n.cik10)} ${n.text}`;
      const refs = [n.request_id, n.run_id ? `run:${n.run_id}` : undefined, `session:${n.session_id}`].filter(
        (x): x is string => !!x,
      );
      const tags = [
        `vendor:${n.vendor_id}`,
        ...(n.uei ? [`uei:${n.uei}`] : []),
        ...(n.cik10 ? [`cik:${n.cik10}`] : []),
        ...n.codes.map((c) => `code:${c}`),
        "kind:note",
        `session:${n.session_id}`,
      ];
      const rec = h.add({
        content,
        type: "factual",
        layer: "working",
        confidence: 0.75,
        source: `analyst:${n.author}`,
        tags,
        provenance: {
          origin: "user_correction",
          learnedAt: this.clock(),
          label: `Analyst note on ${n.vendor_id} by ${n.author}`,
          refs,
        },
      });
      const old = rec.supersedes ?? this.supersededBy(h, rec, n.vendor_id, n.text);
      if (old) {
        h.store.update(rec.id, { supersedes: old });
        h.store.update(old, { supersededBy: rec.id });
      }
      const conflicts: Array<{ with: string; reason: string; confidence: number; resolution: "auto" | "queued" }> = [];
      for (const c of h.conflicts.scan().filter((x) => x.memoryA === rec.id || x.memoryB === rec.id)) {
        const other = c.memoryA === rec.id ? c.memoryB : c.memoryA;
        const res = h.conflicts.autoResolve(c);
        if (res === "queued") {
          for (const [id, peer] of [
            [rec.id, other],
            [other, rec.id],
          ] as const) {
            const m = h.store.get(id)!;
            if (!m.tags.includes(`conflict:${peer}`)) h.store.update(id, { tags: [...m.tags, `conflict:${peer}`] });
          }
        }
        conflicts.push({
          with: other,
          reason: c.reason,
          confidence: Number(c.confidence.toFixed(3)),
          resolution: res === "resolved" ? "auto" : "queued",
        });
      }
      return noteResult(h.store.get(rec.id)!, conflicts);
    });
  }

  /**
   * The engine marks `supersedes` only above cosine 0.85. With the stored subject prefix a real correction scores lower
   * (the 05 3.8 (4) text measures 0.77), so the adapter applies a correction-word rule at 0.60 on the same vendor.
   */
  private supersededBy(h: HMEM, rec: MemoryRecord, vendorId: string, text: string): string | null {
    if (!CORRECTION.test(text)) return null;
    const peers = h.store
      .all()
      .filter(
        (m) =>
          m.id !== rec.id && m.tags.includes(`vendor:${vendorId}`) && m.tags.includes("kind:note") && !m.supersededBy,
      )
      .map((m) => ({ id: m.id, sim: cosine(rec.embedding, m.embedding) }))
      .filter((p) => p.sim >= 0.6)
      .sort((a, b) => b.sim - a.sim);
    return peers[0]?.id ?? null;
  }

  addOutcome(o: OutcomeX): Promise<{ memory_id: string } | null> {
    if (!o.vendor_id) return Promise.resolve(null);
    return this.write((h) => {
      const verdict = o.outcome === "fraud_confirmed" ? "confirmed as an impersonation" : "confirmed legitimate";
      const extra = [
        o.sender_domain ? `Sender domain ${o.sender_domain}.` : "",
        o.phones?.length ? `Request phones ${o.phones.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const rec = h.add({
        content:
          `${o.request_id} for ${o.vendor_id} (${o.legal_name ?? "unknown"}) was ${verdict} by call-back on ${o.at.slice(0, 10)}. ${extra}`.trim(),
        type: "factual",
        layer: "long_term",
        confidence: 0.9,
        source: `outcome:${o.request_id}`,
        provenance: {
          origin: "manual",
          learnedAt: this.clock(),
          label: `Call-back outcome for ${o.request_id}`,
          refs: [o.request_id, `session:${o.session_id}`],
        },
        tags: [
          `vendor:${o.vendor_id}`,
          `request:${o.request_id}`,
          `outcome:${o.outcome}`,
          "kind:outcome",
          `session:${o.session_id}`,
        ],
      });
      return { memory_id: rec.id };
    });
  }

  feedback(
    memory_id: string,
    kind: "helpful" | "not_helpful" | "wrong",
    _by: string,
  ): ReturnType<MemoryPort["feedback"]> {
    return this.write((h) => {
      const rec = h.store.get(memory_id);
      if (!rec) throw new AppError("not_found", "No such note.", { httpStatus: 404 });
      const before = rec.confidence;
      h.feedback(memory_id, kind);
      if (kind === "helpful" && rec.confidence >= 0.8 && rec.layer !== "long_term")
        h.store.promote(memory_id, "long_term");
      const after = h.store.get(memory_id)!;
      return {
        memory_id,
        confidence_before: Number(before.toFixed(4)),
        confidence_after: Number(after.confidence.toFixed(4)),
        layer: after.layer,
        active: isActive(after),
      };
    });
  }

  async recallForVendor(v: {
    vendor_id: string;
    legal_name: string;
    uei: string | null;
    registrant_cik: string | null;
  }): Promise<{ memories: MemoryRecall[]; context: string | null }> {
    const res = this.engine().query(`${v.legal_name} ${v.uei ?? ""} ${v.registrant_cik ?? ""} address`, {
      topN: 3,
      threshold: 0.2,
    });
    const memories = res.memories.map(({ memory: m }) => ({
      engine: "hmem" as const,
      memory_id: m.id,
      session_id: tagValue(m, "session") ?? "",
      text: textOf(m),
      effect: EFFECT,
      confidence: m.confidence,
      active: isActive(m, v),
    }));
    return { memories, context: res.context || null };
  }

  async ledger(memory_id: string): Promise<LedgerRow[]> {
    return this.engine()
      .ledger.history(memory_id)
      .map((e) => ({
        action: e.action,
        actor: e.actor,
        timestamp: new Date(e.timestamp).toISOString(),
        confidence_before: (e.previousState?.confidence as number | undefined) ?? null,
        confidence_after: (e.newState?.confidence as number | undefined) ?? null,
      }));
  }

  async list(vendor_id: string): Promise<MemoryNote[]> {
    return this.engine()
      .store.all()
      .filter((m: MemoryRecord) => m.tags.includes(`vendor:${vendor_id}`) && m.tags.includes("kind:note"))
      .map((m: MemoryRecord) => ({
        memory_id: m.id,
        text: textOf(m),
        vendor_id,
        confidence: m.confidence,
        layer: m.layer,
        tags: m.tags,
        session_id: tagValue(m, "session"),
        source: m.source,
        superseded: !!m.supersededBy,
      }));
  }
}
