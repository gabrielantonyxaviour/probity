// Lane pinning (05 §4.5): exact nvidia/* ids only. `meterless/*` routing ids are refused (their ready classes include paid
// Anthropic models, DEC-01). Vision is always unavailable: there is no image path to NVIDIA on this edition (REV-16).
import type { NightshiftStatus } from "../../schemas/models";
import { ModelCallFailed } from "./errors";
import { logger } from "../../trace/logger";

export type PinSource = "env" | "catalog_nemotron" | "none";
export type LaneState = "confirmed_nemotron" | "routed_unconfirmed" | "non_nemotron" | "unavailable" | "untested";
export type LaneRecord = {
  requested_model: string | null;
  pin_source: PinSource;
  state: LaneState;
  last_model: string | null;
  last_latency_ms: number | null;
  checked_at: string | null;
  extras_unsupported: boolean;
  calls_made: number;
};
export type LanePins = Record<"fast" | "deep", { id: string | null; source: PinSource }>;

/** True only for an exact NVIDIA id. */
export const isNvidiaId = (id: string): boolean => id.startsWith("nvidia/") && !id.startsWith("meterless/");

/** Refuse `meterless/*` and any non-NVIDIA id (config, pinner and request builder all call this). */
export function assertPinnable(id: string, callId?: string): void {
  if (!isNvidiaId(id)) throw new ModelCallFailed("bad_request", { ...(callId ? { call_id: callId } : {}), note: "non_nvidia_model_id" });
}

const LANE_REGEX = {
  fast: [/lightning/i, /nano/i],
  deep: [/ultra/i, /nemotron-3-super(?!-vl)/i],
} as const;

/** `catalog` null means the catalog could not be read: the env pin is kept untested. */
export function pinLanes(catalog: string[] | null, env: { fast?: string | undefined; deep?: string | undefined }): LanePins {
  const pick = (lane: "fast" | "deep"): { id: string | null; source: PinSource } => {
    const wanted = env[lane];
    if (wanted && isNvidiaId(wanted)) {
      if (catalog === null || catalog.includes(wanted)) return { id: wanted, source: "env" };
      logger.warn({ lane }, "lane_env_not_in_catalog");
    }
    if (catalog) {
      const nemotron = catalog.filter((id) => isNvidiaId(id) && /nemotron/i.test(id));
      for (const re of LANE_REGEX[lane]) {
        const hit = nemotron.find((id) => re.test(id));
        if (hit) return { id: hit, source: "catalog_nemotron" };
      }
    }
    return { id: null, source: "none" };
  };
  return { fast: pick("fast"), deep: pick("deep") };
}

export const emptyLane = (): LaneRecord => ({
  requested_model: null,
  pin_source: "none",
  state: "unavailable",
  last_model: null,
  last_latency_ms: null,
  checked_at: null,
  extras_unsupported: false,
  calls_made: 0,
});

export function applyPins(lanes: Record<"fast" | "deep", LaneRecord>, pins: LanePins): void {
  for (const lane of ["fast", "deep"] as const) {
    const rec = lanes[lane];
    const pin = pins[lane];
    rec.requested_model = pin.id;
    rec.pin_source = pin.source;
    if (!pin.id) rec.state = "unavailable";
    else if (rec.state === "unavailable") rec.state = "untested";
  }
}

/** Classify the model a lane really used. */
export function classifyModel(model: string | null, nemotron: boolean): LaneState {
  if (!model || model.startsWith("meterless/")) return "routed_unconfirmed";
  return nemotron ? "confirmed_nemotron" : "non_nemotron";
}

export function toStatusLanes(
  lanes: Record<"fast" | "deep", LaneRecord>,
  visionCheckedAt: string | null,
): NightshiftStatus["lanes"] {
  const view = (r: LaneRecord) => ({
    requested_model: r.requested_model,
    pin_source: r.pin_source,
    state: r.state,
    last_model: r.last_model,
    last_latency_ms: r.last_latency_ms,
    checked_at: r.checked_at,
  });
  return {
    fast: view(lanes.fast),
    deep: view(lanes.deep),
    vision: {
      requested_model: null,
      pin_source: "none",
      state: "unavailable",
      last_model: null,
      last_latency_ms: null,
      checked_at: visionCheckedAt,
    },
  };
}

