/**
 * The payment river: Probity's own field function (motion.md section 4.1). Pure TypeScript with no DOM, React, Date
 * or Math.random, so the landing page, the video and the OG image draw the same frame from the same numbers.
 *
 * `t` is wall-clock seconds; the field applies FIELD.speed itself. Tiers are indices into GLYPH.
 */
export const FIELD = {
  cellW: 12,
  cellH: 14,
  scale: 0.13,
  speed: 0.9,
  xdFrac: 0.58,
  gateFrac: 0.8,
  gateCols: 3,
  T_STATIC: 12.0,
} as const;

/** 0 empty, 1 bed, 2 water, 3 payment, 4 crest, 5 diverted branch, 6 caught at the gate. */
export type Tier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const GLYPH: Record<Tier, string> = { 0: "", 1: "·", 2: ":", 3: "$", 4: "$", 5: "$", 6: "×" };

/** Branch shape (INFERRED, tuned so about 8 to 14 cells are caught per frame at any width). */
const BRANCH = { sigma: 0.26, floor: 0.55, drift: 0.06, margin: 0.5 } as const;

/** Intensity thresholds (0..255) for tiers 1..4, and for the branch to show at all (255 * vb >= 96). */
const T1 = 14;
const T2 = 48;
const T3 = 96;
const T4 = 168;
const BRANCH_MIN = T3;

const sq = (x: number): number => x * x;

function intensity(v: number): number {
  const s = (v % 0.1) / 0.1;
  return s < 0.1 || s > 0.9 ? 210 * v + 45 : 150 * v;
}

function tierOf(i: number): Tier {
  if (i >= T4) return 4;
  if (i >= T3) return 3;
  if (i >= T2) return 2;
  if (i >= T1) return 1;
  return 0;
}

/** First and last column of the gate for a grid `cols` wide. */
export function gateColumns(cols: number): { first: number; last: number } {
  const first = Math.max(0, Math.round(FIELD.gateFrac * cols) - Math.floor(FIELD.gateCols / 2));
  return { first, last: first + FIELD.gateCols - 1 };
}

/** First column of the branch (the diversion point). */
export function diversionColumn(cols: number): number {
  return Math.ceil(FIELD.xdFrac * cols - 0.5);
}

/** One frame: a tier per cell, row-major (index = row * cols + col). */
export function computeFrame(cols: number, rows: number, t: number, out?: Uint8Array): Uint8Array {
  const n = cols * rows;
  const buf = out && out.length >= n ? out : new Uint8Array(n);
  const { scale } = FIELD;
  const tt = t * FIELD.speed;
  const hc = (rows * scale) / 2;
  const xd = FIELD.xdFrac * cols * scale;
  const gate = gateColumns(cols);
  const rowSin = new Float64Array(rows);
  const rowCos = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * scale;
    rowSin[r] = Math.sin(2.3 * y + 0.4 * tt);
    rowCos[r] = Math.cos(0.13 * y - 0.07 * tt);
  }
  for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * scale;
    const centre = hc + 0.55 * Math.sin(0.35 * x - 0.3 * tt) + 0.2 * Math.sin(0.9 * x + 0.15 * tt);
    const phase = 1.7 * (x - 0.8 * tt);
    const ax = 0.21 * x + 0.05 * tt;
    const branchOn = x > xd && c <= gate.last;
    const dx = x - xd;
    const bCentre = Math.min(centre + BRANCH.drift * dx * dx, rows * scale - BRANCH.margin);
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * scale;
      const band = Math.exp(-sq((y - centre) / 0.85));
      const flow = 0.5 + 0.5 * Math.sin(phase + 0.6 * rowSin[r]);
      const ambient = 0.5 + 0.5 * Math.sin(ax + 0.17 * y) * rowCos[r];
      const v = Math.min(1, Math.max(0, 0.18 * ambient + 0.82 * band * flow));
      let tier = tierOf(intensity(v));
      if (branchOn) {
        const vb = Math.exp(-sq((y - bCentre) / BRANCH.sigma)) * (BRANCH.floor + (1 - BRANCH.floor) * flow);
        if (255 * vb >= BRANCH_MIN) tier = c >= gate.first ? 6 : 5;
      }
      buf[r * cols + c] = tier;
    }
  }
  return buf;
}
