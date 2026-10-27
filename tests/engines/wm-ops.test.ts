// World Model operations: outcome fail-safe, C6 recall, provenance, ties, bounds, storage rules.
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import { WorldModel } from "../../app/engines/world-model/index";
import { DisabledMemory } from "../../app/engines/hmem-adapter";
import { recall } from "../../app/engines/memory-gate";
import { ingestScenario, intakeProv, loadFixture, newWorld, S1_RUN, tmpWorld, type Scenario } from "./helpers/fixtures";

const OUT = {
  request_id: "BCR-2026-0412",
  outcome: "fraud_confirmed",
  by: "Tomás Okafor (fictional)",
  session_id: "s-A",
  at: "2026-10-27T12:30:00.000Z",
  run_id: "r-20261027T123000Z-00a0",
} as const;

describe("recordOutcome fail-safe and the memory gate", () => {
  it("never flags a number or domain a vendor or registrant holds; reports why", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    const s1 = loadFixture("s1-rows.json").request;
    const echo = {
      ...s1,
      request_id: "BCR-2026-0499",
      claims: {
        ...s1.claims,
        sender_domain: "boozallen.example",
        reply_to_domain: "boozallen-payments.example",
        phones: [
          { number: "(703) 902-5000", quote: "main" },
          { number: "(703) 555-0147", quote: "direct" },
        ],
      },
    };
    await w.open();
    await w.ingestRequest(echo, intakeProv(echo, "r-20261027T150000Z-0001"));
    await w.close();
    const res = await w.recordOutcome({ ...OUT, request_id: "BCR-2026-0499" });
    expect(res.flagged.map((f) => f.kind).sort()).toEqual(["bank_account", "domain", "phone"]);
    expect(res.skipped.map((s) => s.value).sort()).toEqual(["+17039025000", "boozallen.example"]);
    expect(res.skipped.every((s) => s.reason.length > 5)).toBe(true);
    await expect(w.recordOutcome({ ...OUT, request_id: "BCR-2026-0001" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("C6 recall: only earlier memories count; phone and account hits cite the writing session", async () => {
    const dir = tmpWorld();
    const a = newWorld(dir, "s-A");
    await ingestScenario(a, loadFixture("s1-rows.json"), S1_RUN);
    await a.recordOutcome({ ...OUT });
    const { s6b, s6d } = loadFixture<{ s6b: Scenario["request"]; s6d: Scenario["request"] }>("s6-requests.json");
    const b = newWorld(dir, "s-B");
    const base = { world: b, memory: new DisabledMemory(), vendors: [] as never[], session_id: "s-B" };
    const r1 = await recall({ ...base, request: s6b, run_started_at: "2026-10-27T13:00:00.000Z" });
    expect(r1.known_bad.map((h) => h.kind)).toEqual(["phone"]);
    expect(r1.memory_recalled[0]).toMatchObject({
      engine: "world_model",
      session_id: "s-A",
      text: "Used in a request later confirmed as an impersonation (session s-A).",
    });
    expect(r1.events[0]).toMatchObject({
      agent_name: "memory_gate",
      action: "memory_recall",
      engine: "world_model",
      output_summary: "world_model fraud_flag: 1 hits",
    });
    const r2 = await recall({ ...base, request: s6d, run_started_at: "2026-10-27T13:00:00.000Z" });
    expect(r2.known_bad.map((h) => h.kind)).toEqual(["bank_account"]);
    expect(r2.known_bad[0]!.value_display).toBe("•••• 0141");
    expect((await recall({ ...base, request: s6b, run_started_at: "2026-10-27T12:00:00.000Z" })).known_bad).toEqual([]);
    expect(
      (await recall({ ...base, session_id: "s-A", request: s6b, run_started_at: "2026-10-27T13:00:00.000Z" }))
        .memory_recalled[0]!.text,
    ).toContain("earlier in this session");
    expect(r1.suppress_g5).toEqual([]);
  });
});

describe("provenance, ties and bounds (M2-M5, M9, M10)", () => {
  it("writes the provenance the spec names and never stores a raw account number", async () => {
    const dir = tmpWorld();
    const w = newWorld(dir);
    const s1 = loadFixture("s1-rows.json");
    await ingestScenario(w, s1, S1_RUN);
    const raw = new WorldModel({ namespace: "probity", storage: "local", directory: dir });
    const entity = (id: string) => raw.view("graph").entity(id)!;
    expect(entity("request:req:BCR-2026-0412").source).toMatchObject({
      kind: "file",
      by: "intake",
      at: new Date(s1.request.received_at).toISOString(),
      runId: S1_RUN,
    });
    const khk = entity("legal_entity:uei:KHK6E1JW9C15-C").source;
    expect(khk).toMatchObject({
      kind: "api",
      by: "evidence_runner",
      runId: S1_RUN,
      url: expect.stringMatching(/^zetaris:\/\/T\d+[a-z]?\/[0-9a-f-]{36}$/),
    });
    expect(khk.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(fs.readFileSync(w.file, "utf-8")).not.toContain("000999000141");
    const typed = { ...s1.request, request_id: "BCR-2026-0446", channel: "typed" as const, doc_ids: [] };
    await w.open();
    await w.ingestRequest(typed, intakeProv(typed, "r-20261027T150000Z-0002"));
    await w.close();
    expect(
      new WorldModel({ namespace: "probity", storage: "local", directory: dir })
        .view("graph")
        .entity("request:req:BCR-2026-0446")!.source.kind,
    ).toBe("manual");
  });

  it("latestFact breaks an assertedAt tie by event order; an outcome carries the analyst provenance", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    await w.recordOutcome({ ...OUT });
    await w.recordOutcome({ ...OUT, outcome: "legitimate" });
    const acct = "bank_account:acct:175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6";
    const f = w.latestFact(acct, "fraud_flag")!;
    expect((f.value as { status: string }).status).toBe("legitimate");
    expect(f.source).toMatchObject({
      kind: "manual",
      by: "analyst:Tomás Okafor (fictional)",
      at: OUT.at,
      runId: OUT.run_id,
    });
    expect(w.knownBad({ account_hash: acct.split(":")[2]!, phones_e164: [], domains: [] })).toEqual([]);
  });

  it("hard links are approved by rules at once; the run clock orders facts inside one run", async () => {
    const w = newWorld();
    const s1 = loadFixture("s1-rows.json");
    await ingestScenario(w, s1, S1_RUN);
    const prov = { kind: "agent" as const, by: "identity_linker", at: s1.request.received_at, runId: S1_RUN };
    const link = (to: string, hardness: "hard" | "soft") => ({
      link_id: "lnk-aaaaaaaaaaaaaaaa",
      type: "attribution" as const,
      link_type: "attribution" as const,
      from: "request:req:BCR-2026-0412",
      to,
      evidence_ids: [],
      hardness,
      request_id: "BCR-2026-0412",
    });
    await w.proposeLink(link("vendor_record:erp:V-10027", "hard"), prov);
    await w.proposeLink(link("vendor_record:erp:V-10442", "soft"), prov);
    const rows = w.linkStatus("BCR-2026-0412");
    expect(rows.find((r) => r.to.endsWith("V-10027"))).toMatchObject({ status: "approved", by: "rules" });
    expect(rows.find((r) => r.to.endsWith("V-10442"))).toMatchObject({ status: "pending", by: "identity_linker" });
    const at = w
      .linkFactsFor("BCR-2026-0412")
      .map((f) => f.fact.assertedAt)
      .sort();
    expect(new Set(at).size).toBe(2);
    expect(at[0]! < at[1]!).toBe(true);
  });

  it("caps the subgraph at 80 nodes and says so", async () => {
    const w = newWorld();
    const s1 = loadFixture("s1-rows.json");
    const req = { ...s1.request, candidate_vendor_ids: Array.from({ length: 90 }, (_, i) => `V-${String(20000 + i)}`) };
    await w.open();
    await w.ingestRequest(req, intakeProv(req, S1_RUN));
    await w.close();
    const g = w.graphFor("BCR-2026-0412");
    expect(g.nodes).toHaveLength(80);
    expect(g.truncated).toBe(true);
    expect(g.edges.every((e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to))).toBe(true);
  });
});
