import { afterEach, describe, expect, it, vi } from "vitest";
import { makeHarness, post, waitFor, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let h: Harness;
afterEach(async () => {
  await h?.close();
});
const typed = (request_id = "BCR-2026-0412") => ({ input: { request_id, vendor: { legal_name: "Booz Allen Hamilton Inc." } }, options: {} });
const cb = (over: Record<string, unknown> = {}) => ({ request_id: "BCR-2026-0412", vendor_id: "V-10027", phone_e164: "+17039025000", outcome: "confirmed", called_by: "Priya Raman (fictional)", reevaluate: true, ...over });
const body = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;

describe("POST /callbacks (REV-46 server-side number check)", () => {
  it("an arbitrary +1 number claiming edgar_registrant is 400 callback_number_not_scripted; nothing is inserted; the next re-run is unaffected", async () => {
    h = await makeHarness();
    expect((await post(h, "/run", typed())).statusCode).toBe(200);
    const r = await post(h, "/callbacks", cb({ phone_e164: "+12025550123", phone_source: "edgar_registrant" }));
    expect(r.statusCode).toBe(400);
    expect(body(r)).toEqual({ error: "Call-back number is not one of the scripted independent numbers.", code: "callback_number_not_scripted" });
    expect(h.calls.callbacks).toHaveLength(0);
    const rejectedNumberOnRequest = await post(h, "/callbacks", cb({ phone_e164: "+17035550147" })); // on the "do not use" list
    expect(rejectedNumberOnRequest.statusCode).toBe(400);
    expect(h.calls.callbacks).toHaveLength(0);
  });
  it("a scripted number with the wrong source is 400 callback_source_mismatch", async () => {
    h = await makeHarness();
    await post(h, "/run", typed());
    const r = await post(h, "/callbacks", cb({ phone_source: "vendor_master_pre_window" }));
    expect(r.statusCode).toBe(400);
    expect(body(r)).toEqual({ error: "Call-back source does not match the scripted number.", code: "callback_source_mismatch" });
    expect(h.calls.callbacks).toHaveLength(0);
  });
  it("404 no_run_for_request when no finished check exists", async () => {
    h = await makeHarness();
    const r = await post(h, "/callbacks", cb());
    expect(r.statusCode).toBe(404);
    expect(body(r)).toEqual({ error: "No finished check exists for this request.", code: "no_run_for_request" });
  });
  it("called_at must be later than the request's received_at", async () => {
    h = await makeHarness();
    await post(h, "/run", typed());
    const r = await post(h, "/callbacks", cb({ called_at: "2026-10-22T15:00:00Z" }));
    expect(r.statusCode).toBe(400);
    expect(body(r).code).toBe("invalid_input");
    expect(h.calls.callbacks).toHaveLength(0);
  });
  it("a valid call-back inserts the contact-log row with the script's source and starts a real re-evaluation run", async () => {
    h = await makeHarness();
    const first = body(await post(h, "/run", typed())) as { run_id: string };
    const r = await post(h, "/callbacks", cb());
    expect(r.statusCode).toBe(201);
    const res = body(r) as { log_id: string; phone_source: string; mode?: string; rerun: { run_id: string; status: string; events_url: string } };
    expect(res).toMatchObject({ log_id: "CL-40001", phone_source: "edgar_registrant", mode: "sample", rerun: { status: "running" } });
    expect(h.calls.callbacks[0]).toMatchObject({ vendor_id: "V-10027", request_id: "BCR-2026-0412", purpose: "bank_change_callback", phone_e164: "+17039025000", phone_source: "edgar_registrant", outcome: "confirmed", data_origin: "RUNTIME_INPUT" });
    await waitFor(() => !h.ctx.registry.isRunning(res.rerun.run_id));
    const rerun = body(await h.app.inject({ method: "GET", url: `/runs/${res.rerun.run_id}` })) as { input_ref: { kind: string; request_id: string }; status: string };
    expect(rerun).toMatchObject({ status: "success", input_ref: { kind: "reevaluate", request_id: "BCR-2026-0412" } });
    expect(first.run_id).not.toBe(res.rerun.run_id);
  });
  it("no_answer inserts the row but starts no run; --no-reevaluate likewise", async () => {
    h = await makeHarness();
    await post(h, "/run", typed());
    const a = body(await post(h, "/callbacks", cb({ outcome: "no_answer" })));
    expect(a.rerun).toBeUndefined();
    const b = body(await post(h, "/callbacks", cb({ reevaluate: false })));
    expect(b.rerun).toBeUndefined();
    expect(h.calls.callbacks).toHaveLength(2);
  });
  it("denied also records the fraud_confirmed outcome in the World Model and rejects the request (J3)", async () => {
    h = await makeHarness();
    await post(h, "/run", typed());
    const r = await post(h, "/callbacks", cb({ outcome: "denied", reevaluate: false }));
    expect(r.statusCode).toBe(201);
    expect(h.calls.outcomes[0]).toMatchObject({ request_id: "BCR-2026-0412", outcome: "fraud_confirmed", by: "Priya Raman (fictional)", protected: { phones_e164: ["+17039025000"] } });
    expect(h.calls.statuses).toEqual([["BCR-2026-0412", "rejected"]]);
  });
});

describe("POST /outcomes", () => {
  it("writes the World Model for the latest finished run, masks the targets, and rejects the request on fraud_confirmed", async () => {
    h = await makeHarness();
    expect((await post(h, "/outcomes", { request_id: "BCR-2026-0412", outcome: "fraud_confirmed", by: "Tomás Okafor (fictional)" })).statusCode).toBe(404);
    await post(h, "/run", typed());
    const r = await post(h, "/outcomes", { request_id: "BCR-2026-0412", outcome: "fraud_confirmed", by: "Tomás Okafor (fictional)" });
    expect(r.statusCode).toBe(201);
    const res = body(r) as { written: Array<{ target_kind: string; target_id_masked: string; predicate: string }>; skipped: Array<{ value_masked: string }> };
    expect(res.written[0]).toMatchObject({ target_kind: "bank_account", target_id_masked: "••••0141", predicate: "fraud_flag" });
    expect(res.skipped[0]!.value_masked).toBe("+•••••5000");
    expect(h.calls.statuses).toEqual([["BCR-2026-0412", "rejected"]]);
    const legit = await post(h, "/outcomes", { request_id: "BCR-2026-0412", outcome: "legitimate", by: "Tomás Okafor (fictional)" });
    expect(legit.statusCode).toBe(201);
    expect(h.calls.statuses).toHaveLength(1);
  });
  it("notes answer 503 hmem_disabled when H-MEM is off", async () => {
    h = await makeHarness();
    const r = await post(h, "/notes", { vendor_id: "V-10112", text: "CACI remits from Chantilly.", author: "Tomás Okafor (fictional)" });
    expect(r.statusCode).toBe(503);
    expect(body(r).code).toBe("hmem_disabled");
    expect((await post(h, "/notes/m-1/feedback", { kind: "helpful", by: "Tomás Okafor (fictional)" })).statusCode).toBe(503);
  });
});
