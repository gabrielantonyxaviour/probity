// World Model feature tests (05 2.11 (a)-(g), spine 11): no network, own mkdtemp WORLD_DIR per case.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import { WorldModel } from "../../app/engines/world-model/index";
import { phonesOnFileAt } from "../../app/policy/contacts";
import {
  ingestScenario,
  loadFixture,
  newWorld,
  runOutcomeProcess,
  S1_RUN,
  S2_RUN,
  tmpWorld,
  type Scenario,
} from "./helpers/fixtures";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const S1_ACCOUNT = "bank_account:acct:" + sha256("110000000:000999000141");
type OracleEntry = {
  vendor_id: string;
  received_at: string;
  t02: Array<Record<string, string>>;
  t01: Scenario["batches"][number];
  t02_batch: Scenario["batches"][number];
};

describe("World Model feature tests", () => {
  it("(a) ingesting S1 twice leaves the state shape and the event count unchanged", async () => {
    const dir = tmpWorld();
    const s1 = loadFixture("s1-rows.json");
    const w = newWorld(dir);
    const first = await ingestScenario(w, s1, S1_RUN);
    expect(first.request.entities_written).toBeGreaterThan(0);
    expect(first.rows.entities_written + first.rows.edges_written).toBeGreaterThan(20);
    const shape = w.stateShapeCanonical();
    const n = w.worldSeq();
    const again = await ingestScenario(w, s1, S1_RUN);
    expect(w.stateShapeCanonical()).toBe(shape);
    expect(w.worldSeq()).toBe(n);
    expect(again.rows).toMatchObject({ entities_written: 0, edges_written: 0, facts_written: 0 });
    // a fresh process-equivalent instance replaying the file agrees, and a later fetch time changes nothing
    const w2 = newWorld(dir);
    const later = { ...s1, batches: s1.batches.map((b) => ({ ...b, fetched_at: "2026-10-28T09:00:00.000Z" })) };
    await ingestScenario(w2, later, "r-20261028T090000Z-bbbb");
    expect(w2.stateShapeCanonical()).toBe(shape);
    expect(w2.worldSeq()).toBe(n);
  });

  it("(b)(g) a fresh process sees the fraud_flag of another process: R5 inputs hit, vendor identifiers do not", () => {
    const dir = tmpWorld();
    const p1 = runOutcomeProcess(dir);
    expect(p1.flagged).toHaveLength(3);
    const w = newWorld(dir, "s-process-2");
    const hits = w.knownBad({
      account_hash: sha256("110000000:000999000141"),
      phones_e164: ["+17035550147"],
      domains: ["boozallen-payments.example"],
    });
    expect(hits.map((h) => h.kind).sort()).toEqual(["bank_account", "domain", "phone"]);
    expect(
      hits.every(
        (h) =>
          h.session_id === p1.session_id && h.request_id === "BCR-2026-0412" && h.by === "Tomás Okafor (fictional)",
      ),
    ).toBe(true);
    expect(hits.find((h) => h.kind === "bank_account")!.value_display).toBe("•••• 0141");
    expect(w.knownBad({ account_hash: null, phones_e164: ["+17039025000"], domains: ["boozallen.example"] })).toEqual(
      [],
    );
    // (g) W8 guard: replayed from the file, entity.attrs.fraud_flag is gone but latestFact still answers
    const raw = new WorldModel({ namespace: "probity", storage: "local", directory: dir });
    expect(raw.view("graph").entity(S1_ACCOUNT)!.attrs.fraud_flag).toBeUndefined();
    expect((w.latestFact(S1_ACCOUNT, "fraud_flag")!.value as { status: string }).status).toBe("fraud_confirmed");
  });

  it("(c) both parents of UE9QJD4KK1L6 stay open in different contexts and the graph reports the disagreement", async () => {
    const dir = tmpWorld();
    const w = newWorld(dir);
    const s2 = loadFixture("s2-rows.json");
    await ingestScenario(w, s2, S2_RUN);
    const raw = new WorldModel({ namespace: "probity", storage: "local", directory: dir });
    const ids = raw
      .view("graph")
      .neighborsOf("legal_entity:uei:UE9QJD4KK1L6-C", { via: "child_of" })
      .map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["legal_entity:uei:MDSWM6MB1BH7-P", "legal_entity:uei:ZL41ERXMPAR3-P"]));
    const rels = (raw.stateShape() as { relationships: Array<{ from: string; type: string; validTo?: string }> })
      .relationships;
    expect(
      rels
        .filter((r) => r.from === "legal_entity:uei:UE9QJD4KK1L6-C" && r.type === "child_of")
        .every((r) => !r.validTo),
    ).toBe(true);
    const g = w.graphFor("BCR-2026-0416");
    const grp = g.conflict_groups.find(
      (c) => c.kind === "parent_disagreement" && c.from === "legal_entity:uei:UE9QJD4KK1L6-C",
    );
    expect(grp?.edge_ids.length).toBeGreaterThanOrEqual(2);
    // S2: two candidate_vendor edges, attribution left open
    expect(
      g.edges
        .filter((e) => e.type === "candidate_vendor")
        .map((e) => e.to)
        .sort(),
    ).toEqual(["vendor_record:erp:V-10442", "vendor_record:erp:V-10587"]);
  });

  it("(d) a vendor phone change closes the old edge; vendorPhonesAt equals phonesOnFileAt for every S1-S4 vendor", async () => {
    const dir = tmpWorld();
    const w = newWorld(dir);
    const { oracle } = loadFixture<{ oracle: OracleEntry[] }>("contacts.json");
    await w.open();
    for (const o of oracle) await w.ingestRows([o.t01, o.t02_batch], "r-20261027T140000Z-0d0d");
    await w.close();
    expect(w.vendorPhonesAt("V-10027", "2026-10-27T00:00:00Z").map((p) => p.e164)).toEqual(["+17035550182"]);
    const before = w.vendorPhonesAt("V-10027", "2026-09-22T15:12:00Z");
    expect(before.map((p) => p.e164)).toEqual(["+17039025000"]);
    expect(before[0]!.valid_to).toMatch(/^2026-10-19/);
    expect(w.vendorPhoneHistory("V-10027").map((p) => p.e164)).toEqual(["+17039025000", "+17035550182"]);
    for (const o of oracle) {
      for (const at of [o.received_at, new Date(Date.parse(o.received_at) - 30 * 86_400_000).toISOString()]) {
        const wm = w.vendorPhonesAt(o.vendor_id, at).map((p) => p.e164);
        const ref = phonesOnFileAt(o.t02 as never, at).map((p) => p.e164);
        expect({ v: o.vendor_id, at, wm }).toEqual({ v: o.vendor_id, at, wm: ref });
      }
    }
  });

  it("(e) a write without provenance is rejected by the vendored engine", async () => {
    const w = new WorldModel({ namespace: "probity-e", storage: "memory" });
    await expect(w.upsertEntity({ type: "x", name: "y", source: undefined as never })).rejects.toThrow(/provenance/i);
  });

  it("(f) legal entities with equal names never merge and no legal_entity merge is proposed", async () => {
    const dir = tmpWorld();
    await ingestScenario(newWorld(dir), loadFixture("s1-rows.json"), S1_RUN);
    const raw = new WorldModel({ namespace: "probity", storage: "local", directory: dir });
    const a = raw.view("graph").entity("legal_entity:uei:JCBMLGPE6Z71-C")!;
    const b = raw.view("graph").entity("legal_entity:uei:KHK6E1JW9C15-C")!;
    expect(a.name).toBe("BOOZ ALLEN HAMILTON INC");
    expect(b.name).toBe("BOOZ ALLEN HAMILTON INC");
    expect(a.id).not.toBe(b.id);
    expect(
      raw.mergeQueue().filter((m) => m.leftId.startsWith("legal_entity") || m.rightId.startsWith("legal_entity")),
    ).toEqual([]);
  });
});
