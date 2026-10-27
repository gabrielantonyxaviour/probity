// RegistrarPort over the Zetaris lane's `registerSession` (03 §7.3). Gap-fill for app/adapters/zetaris/registrar's `createRegistrar`
// (the platform wiring looks for it). Allow-listed DDL only, admin key, reuse of existing session tables.
import { AppError } from "../../schemas/errors";
import type { Opts, RegistrarPort, RegistrationRequest, RegistrationResult } from "../../schemas/ports";

export type RegisterSession = (
  input:
    | { kind: "recipient"; uei: string; level: "P" | "C" | "R"; via: "direct" | "passthrough" | "mirror" }
    | { kind: "children"; parent_uei: string; via: "direct" | "passthrough" | "mirror" }
    | { kind: "edgar"; cik10: string; via: "direct" | "passthrough" | "mirror" },
) => Promise<{ table: string; reused: boolean; note?: string }>;

export function createRegistrarPort(d: { registerSession: RegisterSession; preregister?: boolean }): RegistrarPort {
  return {
    kind: "live",
    async register(r: RegistrationRequest, o: Opts): Promise<RegistrationResult> {
      const t0 = Date.now();
      if (o.signal?.aborted) throw new AppError("cancelled", "The run was cancelled.");
      try {
        const res = await d.registerSession(
          r.kind === "recipient" ? { kind: "recipient", uei: r.uei, level: r.level, via: "direct" } : r.kind === "children" ? { kind: "children", parent_uei: r.parent_uei, via: "direct" } : { kind: "edgar", cik10: r.cik10, via: "direct" },
        );
        return {
          table: `session.${res.table}`.replace(/^session\.session\./, "session."),
          status: res.reused ? (d.preregister ? "preregistered" : "exists") : "created",
          query_id: null,
          ddl_hash: null,
          latency_ms: Date.now() - t0,
          ...(res.note ? { reason: res.note } : {}),
        };
      } catch (e) {
        const code = (e as { code?: string }).code;
        return { table: "", status: "unavailable", query_id: null, ddl_hash: null, latency_ms: Date.now() - t0, reason: code ?? "registration_failed" };
      }
    },
  };
}
