// Header system chip text from GET /readyz (01 section 5.1, UX-R21). Pure so the down states are unit-tested.
import type { ReadyResponse } from "./contracts";
import { SHELL } from "./copy";
import type { Tone } from "./labels";
import type { ApiClientError } from "./api";

export type LaneKey = "fast" | "deep";
export type LaneView = { key: LaneKey; label: string; requested: string | null; answered: string | null; state: string; glyph: string; ok: boolean };
export type SystemView = { tone: Tone; pulseOff: boolean; long: string; mid: string; short: string; lanes: LaneView[]; mode: "live" | "sample" | "unknown"; entities: number | null; hmem: boolean };

const GLYPH: Record<string, string> = { confirmed_nemotron: "✓", routed_unconfirmed: "?", non_nemotron: "✕", unavailable: "✕", untested: "○" };

type Nightshift = { status: string; lanes?: Record<string, { requested_model: string | null; last_model: string | null; state: string }> };

export function systemView(ready: ReadyResponse | null, error: ApiClientError | null): SystemView {
  const empty = { lanes: [], entities: null, hmem: false };
  if (!ready) {
    const t = error ? SHELL.apiDown : SHELL.checking;
    return { tone: error ? "conflict" : "neutral", pulseOff: true, long: t, mid: t, short: error ? "DOWN" : "…", mode: "unknown", ...empty };
  }
  const ns = ready.checks.nightshift as Nightshift;
  const laneBlock = ns.lanes;
  const lanes: LaneView[] = (["fast", "deep"] as const).map((key) => {
    const l = laneBlock?.[key];
    const state = l?.state ?? "untested";
    return { key, label: SHELL.lane[key], requested: l?.requested_model ?? null, answered: l?.last_model ?? null, state, glyph: GLYPH[state] ?? "○", ok: state === "confirmed_nemotron" };
  });
  const wm = ready.checks.world_model as { entities?: number };
  const hm = ready.checks.hmem as { status: string };
  const base = { lanes, entities: typeof wm.entities === "number" ? wm.entities : null, hmem: hm.status === "ok" };
  if (ready.mode === "sample") {
    return { tone: "info", pulseOff: true, long: SHELL.systemSample, mid: SHELL.systemSample, short: "SAMPLE", mode: "sample", ...base };
  }
  const zetarisOk = ready.checks.zetaris_query.status === "ok";
  if (!zetarisOk) {
    return { tone: "gap", pulseOff: true, long: SHELL.zetarisDown, mid: SHELL.zetarisDown, short: "ZETARIS DOWN", mode: "live", ...base };
  }
  if (ns.status === "offline") return { tone: "gap", pulseOff: true, long: `${SHELL.systemLive} · ${SHELL.nightshiftDown}`, mid: SHELL.nightshiftDown, short: "NO MODELS", mode: "live", ...base };
  if (ns.status === "unauthorized") return { tone: "gap", pulseOff: true, long: `${SHELL.systemLive} · ${SHELL.nightshiftAuth}`, mid: SHELL.nightshiftAuth, short: "NO MODELS", mode: "live", ...base };
  const part = lanes.map((l) => `${l.label} ${l.glyph}`).join(" ");
  const allOk = lanes.every((l) => l.ok);
  return {
    tone: allOk ? "agree" : "gap",
    pulseOff: true,
    long: `${SHELL.systemLive} · Nemotron: ${part}`,
    mid: `${SHELL.systemLive} · Nemotron ${allOk ? "✓" : "?"}`,
    short: "LIVE",
    mode: "live",
    ...base,
  };
}
