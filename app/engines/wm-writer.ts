// Write helpers over the vendored engine (05 2.8): upsertIfChanged, relateOnce, assertFactOnce, latestFact and the
// run clock. They exist because of the engine quirks W4 (re-relate with a new validFrom duplicates an edge), W7
// (upsertEntity always appends) and W8 (supersededBy / entity.attrs[predicate] are lost on reload).
import {
  WorldModel,
  canonicalJson,
  entityIdFromName,
  externalId,
  type Fact,
  type Provenance,
  type Relationship,
} from "./world-model/index.ts";
import type { Prov, WriteSummary } from "../schemas/engines";

export type AttrBag = Record<string, unknown>;

const DISCOVERY_TEMPLATES = new Set(["T11", "T12", "T14", "T16"]);

/** Incremental index over the append-only event log (the engine keeps its edge map private). */
export class EventIndex {
  private scanned = 0;
  private edges = new Map<string, Array<{ id: string; validFrom?: string; validTo?: string }>>();
  private factSeq = new Map<string, number>();
  private firstWrite = new Map<string, Provenance & { at: string }>();
  private discovery = new Map<string, string>();
  constructor(private world: WorldModel) {}

  private sync(): void {
    const ev = this.world.events();
    for (; this.scanned < ev.length; this.scanned++) {
      const e = ev[this.scanned]!;
      if (e.kind === "relate") {
        const r = e.payload as Relationship;
        const k = `${r.from}|${r.type}|${r.to}|${r.context ?? ""}`;
        const list = this.edges.get(k) ?? [];
        list.push({ id: r.id, validFrom: r.validFrom, validTo: r.validTo });
        this.edges.set(k, list);
        this.noteDiscovery(r.from, r.source);
      } else if (e.kind === "assertFact") {
        this.factSeq.set((e.payload as Fact).id, e.seq);
      } else if (e.kind === "upsertEntity") {
        const id = (e.payload as { id: string }).id;
        const source = (e.payload as { source: Provenance & { at: string } }).source;
        if (!this.firstWrite.has(id)) this.firstWrite.set(id, source);
        this.noteDiscovery(id, source);
      }
    }
  }
  /** Runtime discovery: the first write of an entity through a registrar-confirmed source (T11, T12, T14, T16). */
  private noteDiscovery(entityId: string, source: Provenance): void {
    const m = source.url?.match(/^zetaris:\/\/(T\d+[a-z]?)\//);
    if (m && DISCOVERY_TEMPLATES.has(m[1]!) && source.runId && !this.discovery.has(entityId))
      this.discovery.set(entityId, source.runId);
  }
  discoveredIn(entityId: string): string | undefined {
    this.sync();
    return this.discovery.get(entityId);
  }
  edgesFor(
    from: string,
    type: string,
    to: string,
    ctx: string,
  ): Array<{ id: string; validFrom?: string; validTo?: string }> {
    this.sync();
    return this.edges.get(`${from}|${type}|${to}|${ctx}`) ?? [];
  }
  seqOf(factId: string): number {
    this.sync();
    return this.factSeq.get(factId) ?? 0;
  }
  firstSource(entityId: string): (Provenance & { at: string }) | undefined {
    this.sync();
    return this.firstWrite.get(entityId);
  }
}

export function parseRunStart(runId: string, fallbackIso: string): number {
  const m = runId.match(/^r-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
  const t = m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : NaN;
  return Number.isNaN(t) ? Date.parse(fallbackIso) : t;
}

/** `at = new Date(runStartMs + seq)`: agent facts within one run are strictly ordered; never wall clock. */
export class RunClock {
  private runs = new Map<string, { start: number; n: number }>();
  tick(runId: string, fallbackIso: string): string {
    let r = this.runs.get(runId);
    if (!r) {
      r = { start: parseRunStart(runId, fallbackIso), n: 0 };
      this.runs.set(runId, r);
    }
    r.n += 1;
    return new Date(r.start + r.n).toISOString();
  }
}

export const emptySummary = (): WriteSummary => ({
  entities_written: 0,
  edges_written: 0,
  facts_written: 0,
  skipped_unchanged: 0,
});

export class Writer {
  summary = emptySummary();
  constructor(
    public world: WorldModel,
    public idx: EventIndex,
  ) {}

  resetSummary(): WriteSummary {
    const s = this.summary;
    this.summary = emptySummary();
    return s;
  }

  /** Externally keyed entity; skipped when every attr we would write is already stored with the same value. */
  async entity(
    type: string,
    system: string,
    key: string,
    attrs: AttrBag,
    name: string | undefined,
    prov: Prov,
    opts: { ifAbsent?: boolean } = {},
  ): Promise<string> {
    const id = externalId(type, system, key);
    if (opts.ifAbsent && this.world.view("graph").entity(id)) {
      this.summary.skipped_unchanged += 1; // addresses keep the unit and zip as first seen (05 2.4)
      return id;
    }
    await this.upsert(id, type, { externalKey: { system, id: key } }, attrs, name, prov);
    return id;
  }

  /** Name-keyed entity (claimed_party only). */
  async nameKeyed(type: string, name: string, attrs: AttrBag, prov: Prov): Promise<string> {
    const id = entityIdFromName(type, name);
    await this.upsert(id, type, {}, attrs, name, prov);
    return id;
  }

  private async upsert(
    id: string,
    type: string,
    key: { externalKey?: { system: string; id: string } },
    attrs: AttrBag,
    name: string | undefined,
    prov: Prov,
  ): Promise<void> {
    const existing = this.world.view("graph").entity(id);
    if (existing && (name === undefined || existing.name === name)) {
      const same = Object.keys(attrs).every((k) => canonicalJson(existing.attrs[k]) === canonicalJson(attrs[k]));
      if (same) {
        this.summary.skipped_unchanged += 1;
        return;
      }
    }
    await this.world.upsertEntity({ type, ...key, name, attrs, source: prov });
    this.summary.entities_written += 1;
  }

  /** Relate unless an equivalent open edge (or the same dated edge) exists. */
  async relate(
    from: string,
    type: string,
    to: string,
    context: string,
    validFrom: string,
    validTo: string | null,
    prov: Prov,
    attrs?: AttrBag,
  ): Promise<void> {
    const same = this.idx.edgesFor(from, type, to, context);
    const dated = same.some((e) => e.validFrom === validFrom && (e.validTo ?? null) === validTo);
    const open =
      same.length > 0 &&
      this.world
        .view("graph")
        .neighborsOf(from, { via: type, inContext: context })
        .some((n) => n.id === to);
    if (dated || (open && validTo === null)) {
      this.summary.skipped_unchanged += 1;
      return;
    }
    await this.world.relate({ from, type, to, context, validFrom, validTo: validTo ?? undefined, attrs, source: prov });
    this.summary.edges_written += 1;
  }

  /** Latest fact by assertedAt, ties by event seq. Never reads supersededBy or entity.attrs (W8). */
  latestFact(about: string, predicate: string): Fact | undefined {
    let best: Fact | undefined;
    let bestSeq = -1;
    for (const f of this.world.view("facts").about(about)) {
      if (f.predicate !== predicate) continue;
      const seq = this.idx.seqOf(f.id);
      if (!best || f.assertedAt > best.assertedAt || (f.assertedAt === best.assertedAt && seq > bestSeq)) {
        best = f;
        bestSeq = seq;
      }
    }
    return best;
  }

  /** Idempotent fact: skipped when the latest value is canonically equal. */
  async factOnce(about: string, predicate: string, value: unknown, prov: Prov, confidence = 0.9): Promise<void> {
    const cur = this.latestFact(about, predicate);
    if (cur && canonicalJson(cur.value) === canonicalJson(value)) {
      this.summary.skipped_unchanged += 1;
      return;
    }
    await this.fact(about, predicate, value, prov, confidence);
  }

  /** Always appends (fraud_flag and link verdicts: history is the point). */
  async fact(about: string, predicate: string, value: unknown, prov: Prov, confidence = 0.9): Promise<Fact> {
    const f = await this.world.assertFact({ about, predicate, value, confidence, source: prov });
    this.summary.facts_written += 1;
    return f;
  }
}
