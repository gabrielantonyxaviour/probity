import { describe, expect, it, vi } from "vitest";
import { createRegistrarPort } from "../../../app/runtime/registrar-port";
import { ZetarisError } from "../../../app/adapters/zetaris/errors";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const cfg = { REGISTRY_PATH: "direct" as const, PREREGISTER_DISCOVERY: false };

describe("RegistrarPort over registerSession", () => {
  it("maps the three request kinds, qualifies the table and reports created / exists / preregistered", async () => {
    const seen: unknown[] = [];
    const reg = vi.fn(async (i: unknown) => {
      seen.push(i);
      return { table: "pp_usa_r_khk6e1jw9c15", reused: seen.length > 1 };
    });
    const port = createRegistrarPort(cfg, reg);
    const a = await port.register({ kind: "recipient", uei: "KHK6E1JW9C15", level: "C", run_id: "r-1" }, { timeoutMs: 1000 });
    expect(a).toMatchObject({ table: "session.pp_usa_r_khk6e1jw9c15", status: "created" });
    expect(seen[0]).toEqual({ kind: "recipient", uei: "KHK6E1JW9C15", level: "C", via: "direct" });
    expect((await port.register({ kind: "children", parent_uei: "MBPHTU7Y9S65", run_id: "r-1" }, { timeoutMs: 1000 })).status).toBe("exists");
    expect(seen[1]).toEqual({ kind: "children", parent_uei: "MBPHTU7Y9S65", via: "direct" });
    expect((await createRegistrarPort({ ...cfg, PREREGISTER_DISCOVERY: true }, async () => ({ table: "pp_sec_s_0001443646", reused: true })).register({ kind: "registrant", cik10: "0001443646", run_id: "r-1" }, { timeoutMs: 1000 })).status).toBe("preregistered");
  });
  it("the gateway path registers through the pass-through form", async () => {
    const reg = vi.fn(async () => ({ table: "pp_usa_r_x_pt", reused: false }));
    await createRegistrarPort({ ...cfg, REGISTRY_PATH: "gateway" }, reg).register({ kind: "registrant", cik10: "0001443646", run_id: "r-1" }, { timeoutMs: 1000 });
    expect(reg).toHaveBeenCalledWith({ kind: "edgar", cik10: "0001443646", via: "passthrough" });
  });
  it("a refused admin key is status unavailable / registrar_refused, not an error", async () => {
    const port = createRegistrarPort(cfg, async () => {
      throw new ZetarisError("zetaris_forbidden", "forbidden at 10.0.0.1", 403);
    });
    const r = await port.register({ kind: "recipient", uei: "KHK6E1JW9C15", level: "C", run_id: "r-1" }, { timeoutMs: 1000 });
    expect(r).toMatchObject({ status: "unavailable", reason: "registrar_refused", query_id: null });
    expect(JSON.stringify(r)).not.toContain("10.0.0.1");
  });
  it("other adapter failures are unavailable with the typed code; unknown errors propagate", async () => {
    const timeout = createRegistrarPort(cfg, async () => {
      throw new ZetarisError("zetaris_timeout", "slow");
    });
    expect((await timeout.register({ kind: "children", parent_uei: "MBPHTU7Y9S65", run_id: "r-1" }, { timeoutMs: 1000 })).reason).toBe("zetaris_timeout");
    const boom = createRegistrarPort(cfg, async () => {
      throw new TypeError("bug");
    });
    await expect(boom.register({ kind: "children", parent_uei: "MBPHTU7Y9S65", run_id: "r-1" }, { timeoutMs: 1000 })).rejects.toThrow(TypeError);
  });
});
