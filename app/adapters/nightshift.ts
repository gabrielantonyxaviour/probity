// Nightshift facade (06 §6.2, 05 §4.1). `createModelClient(cfg)` returns the NullModelClient in SAMPLE_MODE (no socket is
// ever opened, nothing is canned or replayed) and the NightshiftClient otherwise. `ports.ts` re-exports these types.
import type { Config } from "../config/env";
import type { ChatRequest, ChatResult, ModelClient, NightshiftStatus } from "../schemas/models";
import { emit, getTraceWriter } from "../trace/tracer";
import { masker } from "../trace/mask";
import { ModelUnavailable } from "./nightshift/errors";
import { NightshiftClient, type ClientConfig, type ClientDeps } from "./nightshift/client";
import { ReceiptStore } from "./nightshift/receipts";
import { toStatusLanes, emptyLane } from "./nightshift/lanes";

export type { ChatRequest, ChatResult, ModelClient, NightshiftStatus } from "../schemas/models";
export type { Lane } from "../schemas/trace";
export { ModelUnavailable, ModelCallFailed, ModelBudgetExceeded, isModelFailure } from "./nightshift/errors";
export { NightshiftClient } from "./nightshift/client";
export type { ChatRequestX, ClientConfig } from "./nightshift/client";
export { ReceiptStore } from "./nightshift/receipts";

/** SAMPLE_MODE: every `chat` throws ModelUnavailable("sample_mode"); no socket opens. Each agent has its own sample path. */
export class NullModelClient implements ModelClient {
  async status(): Promise<NightshiftStatus> {
    return {
      status: "offline",
      base_url_host: null,
      catalog_count: null,
      lanes: toStatusLanes({ fast: emptyLane(), deep: emptyLane() }, null),
    };
  }
  async chat(_req: ChatRequest): Promise<ChatResult> {
    throw new ModelUnavailable("sample_mode");
  }
}

type FactoryConfig = ClientConfig & Pick<Config, "SAMPLE_MODE" | "dirs"> & { model_endpoint?: Config["model_endpoint"] };
/** Point the client at the selected provider: Token Factory's URL and key replace the Nightshift fields. */
export function clientConfigFor(cfg: FactoryConfig): ClientConfig {
  const ep = cfg.model_endpoint;
  if (!ep || ep.provider !== "nebius") return cfg;
  return { ...cfg, MODEL_PROVIDER: "nebius", METERLESS_BASE_URL: ep.baseUrl, METERLESS_RUNTIME_TOKEN: ep.token };
}
export function createModelClient(cfg: FactoryConfig, deps: Partial<ClientDeps> = {}): ModelClient & { currentToolMode?(): "native" | "json" } {
  if (cfg.SAMPLE_MODE) return new NullModelClient();
  getTraceWriter(); // the logs directory exists before the first receipt
  return new NightshiftClient(clientConfigFor(cfg), { receipts: new ReceiptStore(cfg.dirs.logs, masker), emit, ...deps });
}
