// Per-run event bus (06 §4.4, §12.2). `id` is a bus counter separate from the trace `seq`; replay from Last-Event-ID uses it.
// 20 subscribers per run, 2,000 buffered events. Events come only from real work: nothing here replays or times anything.
import type { SseEventName } from "../schemas/events";

export type BusEntry = { id: number; event: SseEventName; data: unknown };
type Listener = (e: BusEntry) => void;
type RunChannel = { buffer: BusEntry[]; nextId: number; subs: Set<Listener>; closed: boolean; dropped: number };

export const MAX_SUBSCRIBERS = 20;
export const MAX_BUFFER = 2000;
const MAX_CHANNELS = 200;

export class RunBus {
  private readonly channels = new Map<string, RunChannel>();
  private readonly global = new Set<(runId: string, e: BusEntry) => void>();

  private channel(runId: string): RunChannel {
    let c = this.channels.get(runId);
    if (!c) {
      c = { buffer: [], nextId: 1, subs: new Set(), closed: false, dropped: 0 };
      this.channels.set(runId, c);
      this.evict();
    }
    return c;
  }

  private evict(): void {
    if (this.channels.size <= MAX_CHANNELS) return;
    for (const [id, c] of this.channels) {
      if (this.channels.size <= MAX_CHANNELS) break;
      if (c.closed && c.subs.size === 0) this.channels.delete(id);
    }
  }

  /** Append an event and fan it out. Returns the bus id. `done` and `error` close the channel. */
  publish(runId: string, event: SseEventName, data: unknown): number {
    const c = this.channel(runId);
    const entry: BusEntry = { id: c.nextId++, event, data };
    c.buffer.push(entry);
    if (c.buffer.length > MAX_BUFFER) {
      c.buffer.shift();
      c.dropped += 1;
    }
    if (event === "done" || event === "error") c.closed = true;
    for (const l of c.subs) l(entry);
    for (const g of this.global) g(runId, entry);
    return entry.id;
  }

  has(runId: string): boolean {
    return this.channels.has(runId);
  }
  isClosed(runId: string): boolean {
    return this.channels.get(runId)?.closed ?? false;
  }
  /** Buffered events with id > fromId. */
  history(runId: string, fromId = 0): BusEntry[] {
    return (this.channels.get(runId)?.buffer ?? []).filter((e) => e.id > fromId);
  }
  subscriberCount(runId: string): number {
    return this.channels.get(runId)?.subs.size ?? 0;
  }
  /** Subscribe from `fromId`: buffered events are delivered first (synchronously), then live ones. null when the run has 20 subscribers. */
  subscribe(runId: string, fromId: number, listener: Listener): (() => void) | null {
    const c = this.channel(runId);
    if (c.subs.size >= MAX_SUBSCRIBERS) return null;
    for (const e of c.buffer) if (e.id > fromId) listener(e);
    c.subs.add(listener);
    return () => void c.subs.delete(listener);
  }
  /** Observe every run (the run registry builds `live` from this). */
  onAny(fn: (runId: string, e: BusEntry) => void): () => void {
    this.global.add(fn);
    return () => void this.global.delete(fn);
  }
  forget(runId: string): void {
    this.channels.delete(runId);
  }
  /** Drop every channel (a process restart, in tests). Subscribers are not notified. */
  clear(): void {
    this.channels.clear();
  }
}

export const bus = new RunBus();
