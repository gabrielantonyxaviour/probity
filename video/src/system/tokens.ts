// Griffin-derived tokens (DESIGN_SYSTEM tokens.css, dark theme). A hex outside this file is a defect.
export const C = {
  ground: "#0c0c0b",
  fg: "#f9f5ef",
  fg2: "#d4cfc6",
  muted: "#959089",
  subtle: "#7c7771",
  rule: "#363533",
  ruleStrong: "#514e4b",
  surface: "#1a1918",
  surface2: "#2c2a28",
  t1: "#1a1918",
  t2: "#2c2a28",
  t3: "#514e4b",
  t4: "#959089",
  hold: "#f85156",
  holdText: "#f87171",
  holdBg: "#281414",
  holdBorder: "#6a2829",
  agree: "#85eda5",
  gap: "#f5be0e",
  cobalt: "#aab8fe",
  teal: "#00d7ca",
  violet: "#b29bff",
  olive: "#a59066",
  info: "#aab8fe",
  real: "#00d7ca",
} as const;

export const STEP = { read: C.cobalt, gather: C.teal, challenge: C.violet, decide: C.hold } as const;

export const FONT = {
  serif: '"Newsreader Variable", "Newsreader", "Apple Garamond", Baskerville, serif',
  sans: '"Hanken Grotesk Variable", "Hanken Grotesk", -apple-system, system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
} as const;

export const VIDEO = { width: 1920, height: 1080, fps: 30, columnWidth: 1400 } as const;
export const TOTAL_CAP_SECONDS = 230;
