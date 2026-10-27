// Cell grid of the 3D payment river: 240 x 60 cells, 0.12 x 0.14 world units (motion.md 5.2).
export const COLS = 240;
export const ROWS = 60;
export const N = COLS * ROWS;
export const CW = 0.12;
export const CH = 0.14;
export const cellX = (col: number) => (col + 0.5) * CW;
export const cellZ = (row: number) => (row - ROWS / 2 + 0.5) * CH;

// Glyph kinds (0 = nothing drawn) and colour codes. 0..3 stone tiers, 4.. accent ramps (4 accents x 4 levels), 20 = hold red.
export const G_NONE = 0;
export const G_DOT = 1;
export const G_COLON = 2;
export const G_DOLLAR = 3;
export const G_CROSS = 4;
export const COLOR_HOLD = 20;
export const accentColor = (accent: number, level: number) => 4 + accent * 4 + level;

export interface CellBuf {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  g: Uint8Array;
  c: Uint8Array;
  a: Float32Array;
}
export const makeBuf = (): CellBuf => ({
  x: new Float32Array(N),
  y: new Float32Array(N),
  z: new Float32Array(N),
  g: new Uint8Array(N),
  c: new Uint8Array(N),
  a: new Float32Array(N),
});
