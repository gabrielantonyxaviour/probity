/**
 * Probity Tailwind theme (Tailwind CSS v4). Every value points at a CSS variable in tokens.css, so the CSS file stays
 * the single source and light/dark switch without `dark:` variants. Contract: DESIGN_SYSTEM.md.
 *
 * ── Wiring (ui/app/globals.css) ─────────────────────────────────────────────────────────────────────────────────
 *   @import "tailwindcss";
 *   @import "./tokens.css";                 // copy of _docs/design/griffin/tokens.css
 *   @config "../tailwind-theme.ts";          // v4 loads a JS/TS config through @config (theme + screens only)
 * Import tokens.css AFTER tailwindcss and outside any @layer: its unlayered variables must beat Tailwind's default
 * theme layer, which shares the names --font-sans, --font-serif, --font-mono and --ease-in-out on purpose.
 * Verified 2026-10-27 with tailwindcss 4.1.11 (@tailwindcss/cli build) and tsc --strict. Node may print "Failed to
 * load the ES module" for a .ts config in a package without "type": "module"; Tailwind then loads it anyway.
 * v4 ignores `corePlugins`, `safelist` and `separator` in a config file; this file uses none of them.
 * `theme.colors`, `fontFamily`, `borderRadius` and `screens` REPLACE Tailwind's defaults on purpose, so off-system
 * utilities such as `bg-red-500`, `font-serif` (Times) or `rounded-2xl` do not exist. `spacing` keeps v4's 4px
 * multiplier; use only the steps 0.5 1 1.5 2 3 4 5 6 8 10 12 16 20 30 (DESIGN_SYSTEM §2.4).
 * Keyframes live in tokens.css (`p-*`); the `animation` entries below only name them.
 *
 * ── Fonts (ui/app/layout.tsx, next/font/google: self-hosted at build, display swap, all SIL OFL 1.1) ─────────────
 *   import { Newsreader, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
 *   const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"],
 *                              display: "swap", variable: "--ff-newsreader" });          // variable wght 200–800
 *   const sans  = Hanken_Grotesk({ subsets: ["latin"], display: "swap", variable: "--ff-hanken" }); // wght 100–900
 *   const mono  = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap",
 *                                 variable: "--ff-plex-mono" });
 *   <html lang="en" data-theme="dark" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
 * The --ff-* names differ from the --font-* stacks on purpose: next/font sets its variable on <html>, and a shared
 * name would overwrite the fallback stack. Only weights 300 (serif, sans prose), 400 (sans UI, mono) and 500 (mono
 * heads, sans group title) are used. Plex Mono's zero is dotted by default: `.font-mono` must carry
 * `font-feature-settings: "zero" 1` (the `mono` font-family utility below cannot set features; see `fontFeature`).
 * Remotion imports the same faces from @fontsource (also OFL) so the video matches the app.
 */
import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

const colors = {
  inherit: "inherit",
  current: "currentColor",
  transparent: "transparent",
  // surfaces
  canvas: v("bg-canvas"),
  surface: { DEFAULT: v("bg-surface"), 2: v("bg-surface-2"), 3: v("bg-surface-3") },
  active: v("bg-active"),
  field: v("bg-field"),
  header: v("bg-header"),
  popover: { DEFAULT: v("bg-popover"), foreground: v("popover-foreground") },
  menu: v("bg-menu"),
  overlay: { hover: v("overlay-hover"), item: v("overlay-item-hover") },
  scrim: v("scrim"),
  // text
  fg: {
    DEFAULT: v("fg"), 2: v("fg-2"), muted: v("fg-muted"), subtle: v("fg-subtle"), disabled: v("fg-disabled"),
  },
  // lines
  rule: { DEFAULT: v("rule"), strong: v("rule-strong"), hover: v("rule-hover"), ui: v("ui-line") },
  input: v("input"),
  ring: v("ring"),
  selection: v("selection"),
  // actions
  primary: {
    DEFAULT: v("primary"), hover: v("primary-hover"), pressed: v("primary-pressed"),
    fg: v("primary-fg"), foreground: v("primary-fg"),
  },
  // evidence semantics (glyph + word + colour, always)
  agree: { DEFAULT: v("agree"), bg: v("agree-bg"), raised: v("agree-bg-raised"), border: v("agree-border") },
  gap: { DEFAULT: v("gap"), bg: v("gap-bg"), raised: v("gap-bg-raised"), border: v("gap-border") },
  conflict: {
    DEFAULT: v("conflict"), text: v("conflict-text"), bg: v("conflict-bg"),
    raised: v("conflict-bg-raised"), border: v("conflict-border"),
  },
  info: { DEFAULT: v("info"), bg: v("info-bg"), raised: v("info-bg-raised"), border: v("info-border") },
  real: { DEFAULT: v("source-real"), bg: v("source-real-bg"), raised: v("source-real-bg-raised") },
  synthetic: {
    DEFAULT: v("source-synthetic"), text: v("source-synthetic-text"), bg: v("source-synthetic-bg"),
  },
  superseded: v("superseded"),
  running: v("running"),
  // decisions
  approve: { DEFAULT: v("approve"), bg: v("approve-bg"), border: v("approve-border"), fg: v("decision-fg") },
  callback: { DEFAULT: v("callback"), bg: v("callback-bg"), border: v("callback-border"), fg: v("decision-fg") },
  hold: { DEFAULT: v("hold"), bg: v("hold-bg"), border: v("hold-border"), fg: v("decision-fg") },
  // code, graph, landing-only
  code: {
    keyword: v("code-keyword"), ident: v("code-ident"), string: v("code-string"),
    number: v("code-number"), param: v("code-param"), comment: v("code-comment"),
  },
  edge: {
    recorded: v("edge-recorded"), approved: v("edge-approved"), rejected: v("edge-rejected"),
    pending: v("edge-pending"), superseded: v("edge-superseded"),
  },
  step: { read: v("step-read"), gather: v("step-gather"), challenge: v("step-challenge"), decide: v("step-decide") },
  matrix: { 1: v("matrix-t1"), 2: v("matrix-t2"), 3: v("matrix-t3"), 4: v("matrix-t4"), caught: v("matrix-caught") },
  // shadcn/ui names, so generated components resolve to Probity tokens
  background: v("background"),
  foreground: v("foreground"),
  card: { DEFAULT: v("card"), foreground: v("card-foreground") },
  secondary: { DEFAULT: v("secondary"), foreground: v("secondary-foreground") },
  muted: { DEFAULT: v("muted"), foreground: v("muted-foreground") },
  accent: { DEFAULT: v("accent"), foreground: v("accent-foreground") },
  destructive: v("destructive"),
  border: v("border"),
};

type Size = [string, { lineHeight: string; letterSpacing?: string; fontWeight?: string }];
const size = (s: string, lh: string, ls?: string, w?: string): Size => [
  v(s),
  { lineHeight: lh.startsWith("--") ? v(lh.slice(2)) : lh, ...(ls && { letterSpacing: ls }), ...(w && { fontWeight: w }) },
];
const SERIF = v("tracking-serif");
const MONO = v("tracking-mono");
const SANS_SM = v("tracking-sans-sm");

const fontSize: Record<string, Size> = {
  // marketing (serif sizes always weight 300)
  hero: size("text-hero", "--leading-hero", SERIF, "300"),
  display: size("text-display", "--leading-display", SERIF, "300"),
  heading: size("text-heading", "--leading-heading", SERIF, "300"),
  title: size("text-title", "--leading-title", SERIF, "300"),
  "title-sm": size("text-title-sm", "--leading-title-sm", SERIF, "300"),
  subheading: size("text-subheading", "--leading-subheading", "0", "300"),
  lede: size("text-lede", "--leading-lede", "0", "300"),
  body: size("text-body", "--leading-body", SANS_SM),
  caption: size("text-caption", "--leading-caption", SANS_SM, "300"),
  "card-title": size("text-card-title", "--leading-card-title", "0", "400"),
  eyebrow: size("text-eyebrow", "1", MONO, "400"),
  small: size("text-small", "--leading-small", SANS_SM, "400"),
  note: size("text-note", "--leading-note", SANS_SM, "400"),
  legal: size("text-legal", "--leading-legal", "0", "400"),
  "mono-section": size("text-mono-section", "--leading-mono-section", MONO, "400"),
  // product (compact)
  "app-title": size("text-app-title", "--leading-app-title", SERIF, "300"),
  decision: size("text-decision", "--leading-decision", SERIF, "300"),
  "app-lede": size("text-app-lede", "--leading-app-lede", "0", "300"),
  ui: size("text-ui", "--leading-ui", SANS_SM),
  "ui-sm": size("text-ui-sm", "--leading-ui-sm", SANS_SM),
  "ui-xs": size("text-ui-xs", "--leading-ui-xs", "0"),
  "mono-ui": size("text-mono-ui", "--leading-mono-ui", MONO, "400"),
  "mono-label": size("text-mono-label", "--leading-mono-label", MONO, "400"),
  "mono-data": size("text-mono-data", "--leading-mono-data", "0", "400"),
  code: size("text-code", "--leading-code", "0", "400"),
  figure: size("text-figure", "1", v("tracking-figure"), "400"),
};

const theme = {
  // Griffin's breakpoints, plus the product's wide switch (01-product-ux §17.1)
  screens: { sm: "40rem", md: "48rem", lg: "60rem", xl: "70rem", "2xl": "80rem", wide: "90rem" },
  colors,
  fontFamily: { serif: v("font-serif"), sans: v("font-sans"), mono: v("font-mono") },
  borderRadius: {
    none: "0", box: v("radius-box"), alert: v("radius-alert"), tile: v("radius-tile"), card: v("radius-card"),
    sheet: v("radius-sheet"), micro: v("radius-micro"), pill: v("radius-pill"), full: "9999px",
    // shadcn compatibility: sm 4 · md 6 · lg 8 · xl 12
    sm: v("radius-box"), md: v("radius-alert"), lg: v("radius-tile"), xl: v("radius-card"),
  },
  extend: {
    fontSize,
    fontWeight: { light: "300", regular: "400", medium: "500" },
    letterSpacing: {
      serif: SERIF, mono: MONO, "mono-panel": v("tracking-mono-panel"), group: v("tracking-group"),
      figure: v("tracking-figure"), "sans-sm": SANS_SM,
    },
    spacing: {
      P: v("P"), "2P": "calc(2 * var(--P))", "3P": "calc(3 * var(--P))",
      app: v("app-P"), "2app": "calc(2 * var(--app-P))", gutter: v("container-pad"),
      header: v("header-h"), "app-header": v("app-header-h"), banner: v("banner-h"), strip: v("strip-h"),
      "row-comfy": v("row-comfy"), "row-compact": v("row-compact"), "row-dense": v("row-dense"),
      "control-sm": v("control-sm"), "control-md": v("control-md"), input: v("input-h"), "icon-box": v("icon-box"),
      "rail-letter": v("rail-letter"), "rail-trace": v("rail-trace"), "rail-collapsed": v("rail-collapsed"),
      matrix: v("matrix-h"),
    },
    maxWidth: {
      container: v("container-max"), dossier: v("dossier-max"), form: v("form-max"), sheet: v("sheet-w"),
      dialog: v("dialog-max"), lede: v("measure-lede"), body: v("measure-body"), heading: v("measure-heading"),
      desc: v("measure-desc"),
    },
    minWidth: { centre: v("centre-min") },
    borderWidth: { hair: v("stroke-hair"), graph: v("stroke-graph"), state: v("stroke-state") },
    boxShadow: {
      "edge-pill": v("edge-pill"), "edge-input": v("edge-input"), "edge-input-focus": v("edge-input-focus"),
      overlay: v("shadow-overlay"),
    },
    backgroundImage: { "dot-grid": "radial-gradient(circle, var(--rule) 1px, transparent 1px)", progress: v("progress-gradient") },
    backgroundSize: { "dot-grid": "16px 16px" },
    backdropBlur: { nav: "12px", menu: "48px", popover: "4px" },
    zIndex: { sticky: v("z-sticky"), header: v("z-header"), nav: v("z-nav"), overlay: v("z-overlay"), toast: v("z-toast") },
    transitionDuration: {
      1: v("dur-1"), 2: v("dur-2"), 3: v("dur-3"), 4: v("dur-4"), 5: v("dur-5"),
      6: v("dur-6"), 7: v("dur-7"), 8: v("dur-8"), 9: v("dur-9"),
    },
    transitionTimingFunction: {
      "quick-out": v("ease-quick-out"), "expo-out": v("ease-expo-out"), "in-out": v("ease-in-out"),
      spring: v("ease-spring"), standard: v("ease-standard"), exit: v("ease-exit"),
      content: v("ease-content"), plain: v("ease-plain"),
    },
    transitionDelay: { stagger: v("stagger"), "stagger-2": "calc(2 * var(--stagger))", "stagger-3": "calc(3 * var(--stagger))", annot: v("stagger-annot") },
    animation: {
      // the one product loop (running dot); pulses take colour from currentColor
      pulse: "p-pulse var(--dur-pulse) var(--ease-plain) infinite",
      "eyebrow-wipe": "p-wipe-in var(--dur-7) var(--ease-content) 50ms both",
      "content-enter": "p-fade-in var(--dur-7) var(--ease-content) both",
      "row-enter": "p-rise-in var(--dur-3) var(--ease-quick-out) both",
      "nav-up": "p-slide-up var(--dur-5) var(--ease-content) both",
      "nav-down": "p-slide-down var(--dur-5) var(--ease-content) both",
      "chip-rise": "p-slide-up var(--dur-5) var(--ease-spring) both",
      draw: "p-draw var(--dur-8) var(--ease-content) 100ms both",
      "annot-in": "p-fade-in var(--dur-4) var(--ease-content) var(--stagger-annot) both",
      "dialog-in": "p-dialog-in var(--dur-1) var(--ease-expo-out) both",
      spin: "p-spin 800ms linear infinite",
    },
  },
};

/** Tailwind cannot attach OpenType features to a font-family utility. Apply these with the matching class. */
export const fontFeature = {
  mono: '"zero" 1, "tnum" 1',          // slashed zero is mandatory on every mono figure (Plex default is dotted)
  serif: '"liga" 1, "clig" 1',
  figures: "tabular-nums slashed-zero", // font-variant-numeric for money and ids in any face
} as const;

export default { theme } satisfies Partial<Config>;
