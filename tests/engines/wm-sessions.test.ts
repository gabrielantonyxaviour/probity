// World Model across processes and storage rules: S6 three sessions, sample-dir wipe, bounded children writes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import {
  intakeProv,
  loadFixture,
  newWorld,
  runOutcomeProcess,
  S1_RUN,
  tmpWorld,
  type Scenario,
} from "./helpers/fixtures";

describe("S6 three sessions (spine 13)", () => {
  it("session b and c, in new processes, see session a's confirmed impersonation on the phone and the account", async () => {
    const dir = tmpWorld();
    const a = runOutcomeProcess(dir);
    const { s6b, s6d, t01_caci, t02_caci } = loadFixture<{
      s6b: Scenario["request"];
      s6d: Scenario["request"];
      t01_caci: Scenario["batches"][number];
      t02_caci: Scenario["batches"][number];
    }>("s6-requests.json");
    const b = newWorld(dir, "s-process-b");
    await b.open();
    await b.ingestRequest(s6b, intakeProv(s6b, "r-20261027T130000Z-0b0b"));
    await b.ingestRows([t01_caci, t02_caci], "r-20261027T130000Z-0b0b");
    await b.close();
    const g = b.graphFor("BCR-2026-0431");
    const phone = g.nodes.find((n) => n.id === "phone:e164:+17035550147")!;
    expect(phone.flags).toContain("fraud_confirmed");
    expect(phone.facts).toEqual([expect.objectContaining({ predicate: "fraud_flag", session_id: a.session_id })]);
    expect(g.nodes.filter((n) => n.flags.includes("fraud_confirmed")).map((n) => n.type)).toEqual(["phone"]);
    const c = newWorld(dir, "s-process-c");
    await c.open();
    await c.ingestRequest(s6d, intakeProv(s6d, "r-20261027T131000Z-0c0c"));
    await c.close();
    const gc = c.graphFor("BCR-2026-0446");
    expect(gc.nodes.find((n) => n.type === "bank_account")).toMatchObject({
      label: "•••• 0141",
      flags: ["fraud_confirmed"],
    });
    // a repeat run of S1 writes nothing new about the request and keeps the earlier history
    expect(c.knownBad({ account_hash: s6d.account_hash, phones_e164: [], domains: [] })[0]?.session_id).toBe(
      a.session_id,
    );
  });
});

describe("storage rules", () => {
  it("SAMPLE_MODE wipes the fixed sample directory once per process unless PAYEE_DEMO_SESSIONS=1; live is never wiped", async () => {
    const prev = process.env.TMPDIR;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probity-tmp-"));
    process.env.TMPDIR = tmp;
    try {
      const marker = path.join(tmp, "probity-sample", ".world", "probity.json");
      const seed = () => (fs.mkdirSync(path.dirname(marker), { recursive: true }), fs.writeFileSync(marker, "{}"));
      for (const [env, wiped] of [
        [{ SAMPLE_MODE: true }, true],
        [{ SAMPLE_MODE: true, PAYEE_DEMO_SESSIONS: "1" }, false],
        [{ SAMPLE_MODE: true, WORLD_DIR: path.join(tmp, "probity-sample") }, false],
        [{ SAMPLE_MODE: false }, false],
      ] as const) {
        vi.resetModules();
        const mod = await import("../../app/engines/wm-adapter");
        seed();
        const w = mod.createWorld({ ...env });
        expect(fs.existsSync(marker)).toBe(!wiped);
        if (!("WORLD_DIR" in env) && env.SAMPLE_MODE) expect(w.dir).toBe(path.join(os.tmpdir(), "probity-sample"));
        if (!env.SAMPLE_MODE) expect(w.dir).toBe(".");
      }
    } finally {
      process.env.TMPDIR = prev;
    }
  });

  it("a state-narrowed children list is never written in full", async () => {
    const w = newWorld();
    const rows = Array.from({ length: 30 }, (_, i) => ({
      child_uei: `ZZ${String(i).padStart(10, "0")}`,
      child_name: `CHILD ${i}`,
      state_province: "VA",
      list_size: 41,
    }));
    await w.open();
    const sum = await w.ingestRows(
      [
        {
          template_id: "T10",
          query_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          row_hash: "h",
          mode: "live",
          fetched_at: "2026-10-27T14:00:00.000Z",
          rows,
          ...{ params: { parent_uei: "MBPHTU7Y9S65" } },
        },
      ],
      S1_RUN,
    );
    await w.close();
    expect(sum.entities_written).toBe(13); // parent plus 12 children
  });
});
