// Copy for the depth features: evidence lineage (D4) and the graph's as-of scrubber (D5).
export const LINEAGE = {
  eyebrow: "Lineage",
  steps: { source: "Source system", table: "USL table", query: "Zetaris query", rows: "Rows returned" },
  usedBy: "This fact",
  alsoJoined: "Joined in the same query",
  unified: "Unified vendor360 layer in Zetaris",
  session: "Registered by Probity during this run",
  matched: (n: number) => (n === 1 ? "1 row carries this fact" : `${n} rows carry this fact`),
  noMatch: "The fact is computed from the rows below.",
  noTable: "No USL table named in this query.",
} as const;

export const ASOF = {
  label: "As of",
  now: "Now",
  received: "Request received",
  decided: "Decision",
  learned: (n: number) => (n === 1 ? "1 fact learned" : `${n} facts learned`),
  live: "Latest",
  prev: "Earlier",
  next: "Later",
  play: "Replay",
  pause: "Pause",
  slider: "Graph as of",
  caption: "Each stop is a moment Probity learned something. Spacing is by event, not to scale.",
  loading: "Loading the graph as of this time…",
  error: "Couldn't load the graph for this time.",
  counts: (n: number, e: number) => `${n} nodes · ${e} edges known`,
} as const;
