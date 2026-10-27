// The payment-river field, motion.md section 4.1. Mirror of ui/lib/matrix-field.ts (not present when this lane was
// written). Signature field(X,Y,t) -> {v, vb}; tier(v). `t` is already seconds x 0.9.
export const CELL_FIELD = 0.13; // field units per cell
export const SPEED = 0.9;
// Landing hero reduced-motion frame (motion.md 2.3). The doc's INFERRED default 12.0 s puts only 5 caught cells on the
// bottom edge of a 1920 px banner; 23.5 s puts 8 on the gate columns inside the banner (verified by scan). The UI lane should use the same value.
export const T_STATIC_SECONDS = 23.5;
export const BRANCH_START = 0.58; // Xd = 0.58 * fieldWidth
export const GATE_AT = 0.8; // gate column = 0.80 * fieldWidth
export const GATE_WIDTH_CELLS = 3;

export interface FieldOut {
  v: number; // 0..1 river
  vb: number; // 0..1 diverted branch (0 past the gate)
}
export interface FieldGeom {
  fieldWidth: number; // field units across the banner (cols * 0.13)
  hc: number; // vertical centre, field units
}

export const centre = (X: number, t: number, hc: number) => hc + 0.55 * Math.sin(0.35 * X - 0.3 * t) + 0.2 * Math.sin(0.9 * X + 0.15 * t);

export function field(X: number, Y: number, t: number, g: FieldGeom): FieldOut {
  const c = centre(X, t, g.hc);
  const band = Math.exp(-(((Y - c) / 0.85) ** 2));
  const flow = 0.5 + 0.5 * Math.sin(1.7 * (X - 0.8 * t) + 0.6 * Math.sin(2.3 * Y + 0.4 * t));
  const ambient = 0.5 + 0.5 * Math.sin(0.21 * X + 0.17 * Y + 0.05 * t) * Math.cos(0.13 * Y - 0.07 * t);
  const xd = BRANCH_START * g.fieldWidth;
  const xg = GATE_AT * g.fieldWidth;
  let vb = 0;
  if (X > xd && X < xg + GATE_WIDTH_CELLS * CELL_FIELD) {
    const bc = c + 0.06 * (X - xd) ** 2;
    vb = Math.exp(-(((Y - bc) / 0.45) ** 2)) * flow;
  }
  const raw = 0.18 * ambient + 0.82 * band * flow;
  return { v: raw < 0 ? 0 : raw > 1 ? 1 : raw, vb };
}

/** Contour emphasis (own constants): returns intensity 0..255. */
export function intensity(v: number): number {
  const s = (v % 0.1) / 0.1;
  return s < 0.1 || s > 0.9 ? 210 * v + 45 : 150 * v;
}

export type Tier = 0 | 1 | 2 | 3 | 4; // 0 empty, 1 `·`, 2 `:`, 3 `$` dim, 4 `$` crest
export function tier(v: number): Tier {
  const i = intensity(v);
  if (i < 14) return 0;
  if (i < 48) return 1;
  if (i < 96) return 2;
  if (i < 168) return 3;
  return 4;
}
export const TIER_GLYPH = ["", "·", ":", "$", "$"] as const;
export const secondsToT = (s: number) => s * SPEED;
