// LLM provider selection: Nebius Token Factory (default on the `nebius` branch) or the Meterless Nightshift gateway.
// Both are OpenAI-compatible and both are pinned to NVIDIA Nemotron ids only (DEC-01). The per-agent model table lives here.
import { PINNED_MODELS } from "../schemas/models";
import { normaliseRuntimeUrl } from "./runtime-url";

export const MODEL_PROVIDERS = ["nebius", "meterless"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
export const DEFAULT_PROVIDER: ModelProvider = "nebius";
export const DEFAULT_TOKEN_FACTORY_URL = "https://api.tokenfactory.nebius.com/v1/";

export type Lane = "fast" | "deep";
/**
 * The one model table. Each agent runs on a lane; each lane has a pinned Nemotron id per provider. The Token Factory ids
 * are the exact, case-sensitive catalog ids (public catalog read 2026-10-29): Lightning is the closest equivalent of the
 * HackOS fast pin (nemotron-3.5-lightning-30b-a3b), Ultra 550B is the same model as the deep pin. Override with
 * LANE_FAST_MODEL / LANE_DEEP_MODEL; when a pin is absent from `/models`, lane discovery picks the catalog's Nemotron.
 */
export const LANE_MODELS: Record<Lane, Record<ModelProvider, string>> = {
  fast: { meterless: PINNED_MODELS.fast, nebius: "nvidia/Nemotron-3_5-Lightning" },
  deep: { meterless: PINNED_MODELS.deep, nebius: "nvidia/Nemotron-3-Ultra-550b-a55b" },
};
export const AGENT_LANES = {
  letter_reader: "deep",
  registry_scout: "fast",
  identity_examiner: "deep",
  gate_officer: "fast",
} as const satisfies Record<string, Lane>;
export type AgentKey = keyof typeof AGENT_LANES;

export const modelFor = (provider: ModelProvider, lane: Lane): string => LANE_MODELS[lane][provider];
/** Model each agent would request under `provider`, after any LANE_*_MODEL override. */
export const agentModels = (provider: ModelProvider, over: Partial<Record<Lane, string | undefined>> = {}): Record<AgentKey, string> =>
  Object.fromEntries(
    (Object.entries(AGENT_LANES) as Array<[AgentKey, Lane]>).map(([agent, lane]) => [agent, over[lane] ?? modelFor(provider, lane)]),
  ) as Record<AgentKey, string>;

export type ProviderInput = {
  MODEL_PROVIDER: ModelProvider;
  NEBIUS_API_KEY?: string | undefined;
  TOKEN_FACTORY_BASE_URL: string;
  METERLESS_BASE_URL: string;
  METERLESS_RUNTIME_TOKEN?: string | undefined;
};
/** Base URL (always `<origin>/<path>/v1`) and bearer credential of the selected provider. */
export function endpointFor(c: ProviderInput): { provider: ModelProvider; baseUrl: string; token: string | undefined; keyName: string } {
  return c.MODEL_PROVIDER === "nebius"
    ? { provider: "nebius", baseUrl: normaliseRuntimeUrl(c.TOKEN_FACTORY_BASE_URL), token: c.NEBIUS_API_KEY, keyName: "NEBIUS_API_KEY" }
    : { provider: "meterless", baseUrl: normaliseRuntimeUrl(c.METERLESS_BASE_URL), token: c.METERLESS_RUNTIME_TOKEN, keyName: "METERLESS_RUNTIME_TOKEN" };
}
