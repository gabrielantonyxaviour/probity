// RegistrarPort over the Zetaris lane's `registerSession` (03 §7.3): the admin key lives behind that function and nowhere
// else. This maps the port's three request kinds to its input, `session.`-qualifies the table name, and turns a refusal
// (401/403 on the admin key) into status `unavailable` / reason `registrar_refused` instead of an error (matrix #12).
import type { Config } from "../config/env";
import { AppError } from "../schemas/errors";
import type { RegistrarPort, RegistrationRequest, RegistrationResult } from "../schemas/ports";
import { registerSession as zetarisRegisterSession, type RegisterInput } from "../adapters/zetaris/registrar";
import { ZetarisError } from "../adapters/zetaris/errors";

type Register = (input: RegisterInput) => Promise<{ table: string; reused: boolean; note?: string }>;
type RegistrarCfg = Pick<Config, "REGISTRY_PATH" | "PREREGISTER_DISCOVERY">;

function toInput(r: RegistrationRequest, via: RegisterInput["via"]): RegisterInput {
  if (r.kind === "recipient") return { kind: "recipient", uei: r.uei, level: r.level, via };
  if (r.kind === "children") return { kind: "children", parent_uei: r.parent_uei, via };
  return { kind: "edgar", cik10: r.cik10, via };
}

export function createRegistrarPort(cfg: RegistrarCfg, register: Register = zetarisRegisterSession): RegistrarPort {
  const via: RegisterInput["via"] = cfg.REGISTRY_PATH === "gateway" ? "passthrough" : "direct";
  return {
    kind: "live",
    async register(r, o): Promise<RegistrationResult> {
      const t0 = Date.now();
      const key = r.kind === "recipient" ? r.uei : r.kind === "children" ? r.parent_uei : r.cik10;
      const unavailable = (reason: string): RegistrationResult => ({ table: `session.pp_${r.kind}_${key.toLowerCase()}`, status: "unavailable", query_id: null, ddl_hash: null, latency_ms: Date.now() - t0, reason });
      if (o.signal?.aborted) return unavailable("cancelled");
      try {
        const done = await Promise.race([
          register(toInput(r, via)),
          new Promise<never>((_res, rej) => setTimeout(() => rej(new AppError("zetaris_timeout", "The registration timed out.", { retryable: true })), o.timeoutMs).unref()),
        ]);
        const status = done.reused ? (cfg.PREREGISTER_DISCOVERY ? "preregistered" : "exists") : "created";
        return { table: `session.${done.table}`, status, query_id: null, ddl_hash: null, latency_ms: Date.now() - t0, ...(done.note ? { reason: done.note } : {}) };
      } catch (e) {
        if (e instanceof ZetarisError && (e.code === "zetaris_auth" || e.code === "zetaris_forbidden")) return unavailable("registrar_refused");
        if (e instanceof ZetarisError || e instanceof AppError) return unavailable(String(e.code));
        throw e;
      }
    },
  };
}
