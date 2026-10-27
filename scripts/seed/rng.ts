// Seeded randomness. mulberry32 at PAYEE_SEED; each concern forks its own stream so edits to one never shift another.
import { createHash } from "node:crypto";
import { PAYEE_SEED } from "../gen/contracts";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;
  constructor(readonly seed: number) {
    this.next = mulberry32(seed);
  }
  static for(label: string): Rng {
    const h = createHash("sha256").update(`${PAYEE_SEED}:${label}`).digest();
    return new Rng(h.readUInt32BE(0));
  }
  float(): number {
    return this.next();
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
  /** Log-uniform integer cents between lo and hi dollars, rounded to whole cents. */
  logCents(loUsd: number, hiUsd: number): number {
    const v = Math.exp(Math.log(loUsd) + this.next() * (Math.log(hiUsd) - Math.log(loUsd)));
    return Math.round(v * 100);
  }
}
