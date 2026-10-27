// World Model lock and reload (05 2.8): contention, stale locks, re-entrancy, reload on another process's write.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import { spawnSync } from "node:child_process";
import { WorldModelAdapter } from "../../app/engines/wm-adapter";
import { lockPath, StateLockedError } from "../../app/engines/state-lock";
import { ingestScenario, loadFixture, newWorld, S1_RUN, tmpWorld } from "./helpers/fixtures";

const fast = (dir: string, session_id: string) => new WorldModelAdapter(dir, { session_id, waitMs: 300, pollMs: 40 });
const writeLock = (dir: string, over: Record<string, unknown>) => {
  fs.mkdirSync(path.join(dir, ".world"), { recursive: true });
  fs.writeFileSync(
    lockPath(dir),
    JSON.stringify({
      pid: process.pid,
      hostname: os.hostname(),
      session_id: "x",
      kind: "cli",
      api_url: null,
      acquired_at: new Date().toISOString(),
      ...over,
    }),
  );
};
const OUT = {
  request_id: "BCR-2026-0412",
  outcome: "fraud_confirmed",
  by: "Tomás Okafor (fictional)",
  session_id: "s-A",
  at: "2026-10-27T12:30:00.000Z",
  run_id: "r-20261027T123000Z-00a0",
} as const;

describe("lock and reload (05 2.8)", () => {
  it("a second writer gets state_locked 409 with the fixed copy; the first release frees it", async () => {
    const dir = tmpWorld();
    const a = fast(dir, "A");
    const b = fast(dir, "B");
    await a.open();
    const err = await b.open().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StateLockedError);
    expect(err).toMatchObject({
      code: "state_locked",
      httpStatus: 409,
      message: "Another run is writing memory. Retry in a minute.",
      cliCode: "world_model_locked",
    });
    expect((err as StateLockedError).holder?.session_id).toBe("A");
    await expect(b.recordOutcome({ ...OUT })).rejects.toMatchObject({ code: "state_locked" });
    await a.close();
    expect(fs.existsSync(lockPath(dir))).toBe(false);
    await b.open();
    await b.close();
  });

  it("open() is re-entrant inside one process and the lock file goes away at the last close", async () => {
    const dir = tmpWorld();
    const a = fast(dir, "A");
    await a.open();
    await a.open();
    await a.close();
    expect(fs.existsSync(lockPath(dir))).toBe(true);
    await a.close();
    expect(fs.existsSync(lockPath(dir))).toBe(false);
  });

  it("a lock from a dead pid, or older than 600 s, is stale and replaced; a fresh foreign-host lock is honoured", async () => {
    const dead = spawnSync(process.execPath, ["-e", "0"]).pid!;
    const d1 = tmpWorld();
    writeLock(d1, { pid: dead });
    await fast(d1, "A").open();
    const d2 = tmpWorld();
    writeLock(d2, { acquired_at: new Date(Date.now() - 601_000).toISOString() });
    await fast(d2, "A").open();
    const d3 = tmpWorld();
    writeLock(d3, { hostname: "other-host.example", pid: 1 });
    await expect(fast(d3, "A").open()).rejects.toBeInstanceOf(StateLockedError);
  });

  it("a long-lived reader sees another instance's writes without reopening", async () => {
    const dir = tmpWorld();
    const reader = newWorld(dir);
    expect(reader.worldSeq()).toBe(0);
    await ingestScenario(newWorld(dir), loadFixture("s1-rows.json"), S1_RUN);
    expect(reader.worldSeq()).toBeGreaterThan(40);
    expect(reader.vendorPhonesAt("V-10027", "2026-10-27T00:00:00Z").map((p) => p.e164)).toEqual(["+17035550182"]);
    expect(reader.graphFor("BCR-2026-0412").nodes.length).toBeGreaterThan(10);
  });
});
