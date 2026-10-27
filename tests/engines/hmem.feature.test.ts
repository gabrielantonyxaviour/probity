// H-MEM feature tests (05 3.8 (1)-(5)): no network, temp dirs, fixed clock. Runs only while the hmem tree exists.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HMEM } from "../../app/engines/hmem/index";
import { createMemory, DisabledMemory } from "../../app/engines/hmem-adapter";
import { recall } from "../../app/engines/memory-gate";
import { loadFixture, newWorld, tmpWorld, type Scenario } from "./helpers/fixtures";

const NOTE =
  "CACI remits from Chantilly (UEI N3PBJAVNKF61). EDGAR's Reston address is the parent HQ. The address difference is expected.";
const CACI = {
  vendor_id: "V-10112",
  legal_name: "CACI, INC. - FEDERAL",
  uei: "N3PBJAVNKF61",
  registrant_cik: "0000016058",
};
const T0 = Date.parse("2026-10-26T13:00:00Z");

const memAt = (dir: string, session = "s-b") =>
  createMemory({ ENABLE_HMEM: true, HMEM_DIR: dir, WORLD_DIR: dir, session_id: session, clock: () => T0 });
const note = (text = NOTE, author = "Tomás Okafor (fictional)") => ({
  vendor_id: "V-10112",
  text,
  author,
  codes: ["I1" as const],
  uei: CACI.uei,
  cik10: CACI.registrant_cik,
  legal_name: CACI.legal_name,
  session_id: "s-b",
});
const s6b = () => loadFixture<{ s6b: Scenario["request"] }>("s6-requests.json").s6b;
const gate = (memory: ReturnType<typeof memAt>) =>
  recall({
    world: newWorld(tmpWorld()),
    memory,
    request: s6b(),
    vendors: [CACI],
    run_started_at: "2026-10-27T10:00:00.000Z",
    session_id: "s-c",
  });

describe("H-MEM feature tests", () => {
  it("is disabled by default: recall is empty and writes throw hmem_disabled", async () => {
    const m = createMemory({});
    expect(m).toBeInstanceOf(DisabledMemory);
    expect((await m.recallForVendor(CACI)).memories).toEqual([]);
    await expect(m.addNote(note())).rejects.toMatchObject({ code: "hmem_disabled", httpStatus: 503 });
    await expect(m.feedback("mem-1", "wrong", "x")).rejects.toMatchObject({ code: "hmem_disabled" });
  });

  it("(1) a note suppresses G5: a fresh load recalls it, active, citing its session", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probity-hm-"));
    const w = await memAt(dir).addNote(note());
    expect(w).toMatchObject({ confidence: 0.75, layer: "working", conflicts: [] });
    expect(w.tags).toEqual(
      expect.arrayContaining(["vendor:V-10112", "uei:N3PBJAVNKF61", "code:I1", "kind:note", "session:s-b"]),
    );
    const res = await gate(memAt(dir, "s-c"));
    expect(res.suppress_g5).toEqual(["V-10112"]);
    expect(res.memory_recalled.find((r) => r.engine === "hmem")).toMatchObject({
      session_id: "s-b",
      text: NOTE,
      effect: "Address variance accepted as known benign; skipped 1 discovery round.",
    });
    expect(res.hmem_context).toContain("[MEMORY CONTEXT]");
    expect(res.events.at(-1)).toMatchObject({ agent_name: "memory_gate", engine: "hmem", engine_op: "query" });
  });

  it("(2) an empty store recalls nothing, so G5 would run", async () => {
    const res = await gate(memAt(fs.mkdtempSync(path.join(os.tmpdir(), "probity-hm-"))));
    expect(res.suppress_g5).toEqual([]);
    expect(res.memory_recalled.filter((r) => r.engine === "hmem")).toEqual([]);
  });

  it("(3) one `wrong` drops the note to 0.55 and inactive; the ledger records create, read and feedback -0.2", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probity-hm-"));
    const m = memAt(dir);
    const { memory_id } = await m.addNote(note());
    await gate(memAt(dir));
    const fb = await m.feedback(memory_id, "wrong", "Tomás Okafor (fictional)");
    expect(fb).toMatchObject({ confidence_before: 0.75, confidence_after: 0.55, active: false });
    expect((await gate(memAt(dir))).suppress_g5).toEqual([]);
    const actions = (await m.ledger(memory_id)).map((r) => r.action);
    expect(actions[0]).toBe("create");
    expect(actions).toContain("read");
    const last = (await m.ledger(memory_id)).filter((r) => r.action === "feedback").at(-1)!;
    expect(last.confidence_after! - last.confidence_before!).toBeCloseTo(-0.2, 5);
    const raw = new HMEM({ persistDir: dir });
    expect(raw.store.get(memory_id)!.tags).toContain("review");
    const helpful = await m.addNote(note("CACI also remits from the Chantilly lockbox for federal invoices."));
    expect((await m.feedback(helpful.memory_id, "helpful", "Tomás Okafor (fictional)")).layer).toBe("long_term");
  });

  it("(4) a correction supersedes the earlier note; only the new note is active", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probity-hm-"));
    const m = memAt(dir);
    const first = await m.addNote(note());
    const second = await m.addNote(note("CACI no longer remits from Chantilly; use Reston."));
    const notes = await m.list("V-10112");
    expect(notes.find((n) => n.memory_id === first.memory_id)!.superseded).toBe(true);
    expect(notes.find((n) => n.memory_id === second.memory_id)!.superseded).toBe(false);
    const rec = await m.recallForVendor(CACI);
    const active = rec.memories.filter((x) => x.active).map((x) => x.memory_id);
    expect(active).not.toContain(first.memory_id);
    expect(active).toContain(second.memory_id);
  });

  it("(5) a record with no source is rejected by the engine", () => {
    expect(() => new HMEM().add({ content: "x", source: "" })).toThrow(/source/);
  });

  it("one lock covers both stores: a note written inside a run's open window reuses the world's lock", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probity-hm-"));
    const world = newWorld(dir);
    const memory = createMemory({ ENABLE_HMEM: true, HMEM_DIR: dir, WORLD_DIR: dir, world, clock: () => T0 });
    await world.open();
    await memory.addNote(note());
    expect(fs.existsSync(path.join(dir, ".world", ".lock"))).toBe(true);
    await world.close();
    expect(fs.existsSync(path.join(dir, ".world", ".lock"))).toBe(false);
    expect((await memory.list("V-10112")).length).toBe(1);
  });

  it("outcome summaries are stored for context but never suppress G5", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probity-hm-"));
    const m = memAt(dir);
    const out = await m.addOutcome({
      request_id: "BCR-2026-0412",
      outcome: "fraud_confirmed",
      by: "Tomás Okafor (fictional)",
      session_id: "s-a",
      at: "2026-10-27T12:30:00.000Z",
      run_id: "r-20261027T123000Z-00a0",
      vendor_id: "V-10027",
      legal_name: "Booz Allen Hamilton Inc",
    });
    expect(out?.memory_id).toMatch(/^mem-/);
    expect((await m.recallForVendor({ ...CACI, vendor_id: "V-10027" })).memories.every((x) => !x.active)).toBe(true);
    expect(
      await m.addOutcome({
        request_id: "BCR-2026-0412",
        outcome: "legitimate",
        by: "x",
        session_id: "s",
        at: "2026-10-27T12:30:00.000Z",
        run_id: "r",
        vendor_id: null,
        legal_name: null,
      }),
    ).toBeNull();
  });
});
