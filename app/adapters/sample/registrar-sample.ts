// RegistrarPort for SAMPLE_MODE (06 section 6.5): "creates" a session table by loading the offline capture behind it. `created` when the
// capture exists (recipient/<id>.json, children/<parent>.json, edgar/submissions/CIK<cik10>.json) and the table was not yet registered in
// this process, `exists` afterwards, `unavailable` with reason `no_capture` otherwise. No DDL is issued and no socket opens.
import type { Config } from "../../config/env";
import { AppError } from "../../schemas/errors";
import type { Opts, RegistrarPort, RegistrationRequest, RegistrationResult } from "../../schemas/ports";
import { registerSession, type Wanted } from "./sample-session";
import { loadSampleData } from "./sample-store";

const wanted = (r: RegistrationRequest): Wanted =>
  r.kind === "recipient" ? { kind: "recipient", uei: r.uei, level: r.level } : r.kind === "children" ? { kind: "children", parent_uei: r.parent_uei } : { kind: "edgar", cik10: r.cik10 };

export function createSampleRegistrar(cfg: Pick<Config, "dirs">): RegistrarPort {
  return {
    kind: "sample",
    async register(r: RegistrationRequest, o: Opts): Promise<RegistrationResult> {
      if (o.signal?.aborted) throw new AppError("cancelled", "The run was cancelled.");
      const t0 = performance.now();
      const ms = () => Math.max(0, Math.round(performance.now() - t0));
      try {
        const hit = registerSession(loadSampleData(cfg.dirs.sample), wanted(r));
        if (!hit) return { table: "", status: "unavailable", query_id: null, ddl_hash: null, latency_ms: ms(), reason: "no_capture" };
        return { table: `session.${hit.table}`, status: hit.created ? "created" : "exists", query_id: null, ddl_hash: null, latency_ms: ms(), reason: "offline capture (SAMPLE_MODE), no DDL executed" };
      } catch {
        return { table: "", status: "unavailable", query_id: null, ddl_hash: null, latency_ms: ms(), reason: "sample_data_missing" };
      }
    },
  };
}
export const createRegistrarSample = createSampleRegistrar;
