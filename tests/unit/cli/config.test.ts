import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, liveMissing, loadConfig } from "../../../app/config/env";
import { PINNED_MODELS } from "../../../app/schemas/models";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const KEY = "zk_live_ABCDEF123456";
const TOKEN = "rtok_0123456789abcdef";

describe("loadConfig (06 §7.2 + platform additions)", () => {
  it("defaults to the two pinned nvidia/* ids and the local Nightshift URL", () => {
    const c = loadConfig({});
    expect(c.LANE_FAST_MODEL).toBe(PINNED_MODELS.fast);
    expect(c.LANE_DEEP_MODEL).toBe(PINNED_MODELS.deep);
    expect(c.METERLESS_BASE_URL).toBe("http://127.0.0.1:8088/v1");
    expect(c.LANE_VISION_MODEL).toBeUndefined();
    expect(c.METERLESS_SCOPE).toBe("app");
    expect(loadConfig({ METERLESS_SCOPE: "user" }).METERLESS_SCOPE).toBe("user");
    expect(() => loadConfig({ METERLESS_SCOPE: "global" })).toThrow(/METERLESS_SCOPE/);
  });
  it("refuses any lane id that is not nvidia/, naming the variable and never a secret value", () => {
    for (const [name, bad] of [["LANE_FAST_MODEL", "meterless/auto"], ["LANE_DEEP_MODEL", "meterless/fusion"], ["LANE_VISION_MODEL", "anthropic/claude-haiku"], ["LANE_JUDGE_MODEL", "gpt-4o"]] as const) {
      let err: unknown;
      try {
        loadConfig({ [name]: bad, ZETARIS_API_KEY: KEY, METERLESS_RUNTIME_TOKEN: TOKEN });
      } catch (e) {
        err = e;
      }
      expect(err, name).toBeInstanceOf(ConfigError);
      const msg = (err as Error).message;
      expect(msg).toContain(name);
      expect(msg).not.toContain(KEY);
      expect(msg).not.toContain(TOKEN);
    }
  });
  it("a placeholder counts as unset; missing live keys never fail the loader but are listed", () => {
    const c = loadConfig({ ZETARIS_QUERY_API_KEY: "<zetaris-query-key>", METERLESS_RUNTIME_TOKEN: "<nightshift-runtime-token>", ERP_DATABASE_URL: "<url>", SEC_USER_AGENT: "<SEC_USER_AGENT>" });
    expect(c.ZETARIS_QUERY_API_KEY).toBeUndefined();
    expect(c.METERLESS_RUNTIME_TOKEN).toBeUndefined();
    expect(c.secUserAgentLive).toBeUndefined();
    expect(liveMissing(c)).toEqual(["ZETARIS_QUERY_API_KEY", "METERLESS_RUNTIME_TOKEN", "ERP_DATABASE_URL"]);
    expect(liveMissing(loadConfig({ SAMPLE_MODE: "true" }))).toEqual([]);
  });
  it("ZETARIS_API_KEY fills the admin and query keys when they are unset or placeholders, and joins secrets", () => {
    const c = loadConfig({ ZETARIS_API_KEY: KEY, ZETARIS_ADMIN_API_KEY: "<zetaris-admin-key>" });
    expect(c.ZETARIS_QUERY_API_KEY).toBe(KEY);
    expect(c.ZETARIS_ADMIN_API_KEY).toBe(KEY);
    expect(c.secrets).toContain(KEY);
    const own = loadConfig({ ZETARIS_API_KEY: KEY, ZETARIS_QUERY_API_KEY: "query-key-1234567" });
    expect(own.ZETARIS_QUERY_API_KEY).toBe("query-key-1234567");
    expect(own.ZETARIS_ADMIN_API_KEY).toBe(KEY);
  });
  it("rt-local is rejected as a token; a pasted /api/v1.0 suffix is stripped; the ERP password joins secrets", () => {
    expect(() => loadConfig({ METERLESS_RUNTIME_TOKEN: "rt-local" })).toThrow(ConfigError);
    expect(loadConfig({ ZETARIS_API_ORIGIN: "http://localhost:8888/api/v1.0/" }).ZETARIS_API_ORIGIN).toBe("http://localhost:8888");
    expect(loadConfig({ ERP_DATABASE_URL: "postgres://payee_app:Sup3rSecretPw@localhost:55432/payee_erp" }).secrets).toContain("Sup3rSecretPw");
  });
  it("normalises METERLESS_BASE_URL", () => {
    expect(loadConfig({ METERLESS_BASE_URL: "host.docker.internal:8088" }).METERLESS_BASE_URL).toBe("http://host.docker.internal:8088/v1");
  });
});

describe(".env.local then .env, process env wins", () => {
  const cwd = process.cwd();
  const saved = { ...process.env };
  afterEach(() => {
    process.chdir(cwd);
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  it("loads both files (the local one first), without overriding the process env", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "probity-env-"));
    writeFileSync(path.join(dir, ".env.local"), "PORT=9101\nHOST=127.0.0.2\n");
    writeFileSync(path.join(dir, ".env"), "PORT=9202\nMODEL_TIMEOUT_MS=45000\nHOST=127.0.0.3\n");
    process.chdir(dir);
    delete process.env.PORT;
    delete process.env.MODEL_TIMEOUT_MS;
    process.env.HOST = "10.0.0.9";
    const c = loadConfig();
    expect(c.PORT).toBe(9101); // .env.local beats .env
    expect(c.MODEL_TIMEOUT_MS).toBe(45000); // .env fills what .env.local lacks
    expect(c.HOST).toBe("10.0.0.9"); // the process env wins over both
  });
});
