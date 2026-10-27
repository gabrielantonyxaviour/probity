// Human-in-the-loop routes (06 §4.7): POST /callbacks (REV-46 server-side number check), /outcomes, /notes, /notes/:id/feedback.
// Every button here does real work: a call-back is a row in the ERP contact log and starts a real re-evaluation run;
// an outcome writes the World Model so the next process sees it.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CallbackBody, CallbackResponse, FeedbackBody, FeedbackResponse, NoteBody, NoteResponse, OutcomeBody, OutcomeResponse } from "../../schemas/api-routes";
import { MEMORY_ID } from "../../schemas/patterns";
import { loadErp, loadVendor } from "../erp-read";
import { readManifest } from "../inbox";
import { fail, parse } from "../error-handler";
import { recordRequestOutcome } from "../outcomes";

const FeedbackParams = z.object({ memory_id: z.string().regex(MEMORY_ID) });

export function registerHuman(app: FastifyInstance): void {
  app.post("/callbacks", async (req, reply) => {
    const c = app.ctx;
    const body = parse(CallbackBody, req.body);
    const latest = c.registry.latestForRequest(body.request_id, true);
    const decision = latest?.live.decision ?? null;
    if (!latest || !decision) throw fail("no_run_for_request", "No finished check exists for this request.");

    const scripts = decision.callback_scripts.filter(
      (s) => s.number_e164 === body.phone_e164 && (s.for_vendor_id === body.vendor_id || s.for_vendor_id === null),
    );
    const script = scripts.find((s) => s.for_vendor_id === body.vendor_id) ?? scripts[0];
    if (!script) throw fail("callback_number_not_scripted", "Call-back number is not one of the scripted independent numbers.");
    if (body.phone_source && body.phone_source !== script.number_source)
      throw fail("callback_source_mismatch", "Call-back source does not match the scripted number.");

    const calledAt = body.called_at ?? new Date().toISOString();
    const received = await receivedAt(app, body.request_id, latest.run_id);
    if (received && Date.parse(calledAt) <= Date.parse(received))
      throw fail("invalid_input", "called_at: must be after the request was received.", 400);

    const { log_id } = await c.ports.erp.insertCallback({
      vendor_id: body.vendor_id,
      request_id: body.request_id,
      purpose: "bank_change_callback",
      phone_e164: body.phone_e164,
      phone_source: script.number_source,
      outcome: body.outcome,
      called_at: calledAt,
      called_by: body.called_by,
      data_origin: "RUNTIME_INPUT",
    });
    if (body.outcome === "denied")
      await recordRequestOutcome(c, { request_id: body.request_id, outcome: "fraud_confirmed", by: body.called_by, note: "call-back denied the request" });

    let rerun: { run_id: string; status: "running"; events_url: string } | undefined;
    if (body.reevaluate && body.outcome !== "no_answer") {
      const started = await c.registry.start({
        input: { request_id: body.request_id, reevaluate: { request_id: body.request_id, from_run_id: latest.run_id } },
        options: { async: true },
        input_ref: { kind: "reevaluate", request_id: body.request_id },
      });
      rerun = { run_id: started.run_id, status: "running", events_url: `/runs/${started.run_id}/events` };
    }
    return reply.code(201).send(
      CallbackResponse.parse({ log_id, phone_source: script.number_source, ...(rerun ? { rerun } : {}), ...(c.config.SAMPLE_MODE ? { mode: "sample" } : {}) }),
    );
  });

  app.post("/outcomes", async (req, reply) => {
    const body = parse(OutcomeBody, req.body);
    return reply.code(201).send(OutcomeResponse.parse(await recordRequestOutcome(app.ctx, body)));
  });

  app.post("/notes", async (req, reply) => {
    const c = app.ctx;
    if (!c.ports.memory.enabled) throw fail("hmem_disabled", "Analyst notes are not enabled in this build.");
    const body = parse(NoteBody, req.body);
    const vendor = await loadVendor(c.config, body.vendor_id);
    if (!vendor) throw fail("not_found", "Vendor not found.");
    const res = await c.ports.memory.addNote({
      ...body,
      uei: vendor.uei,
      cik10: vendor.registrant_cik,
      legal_name: vendor.legal_name,
      session_id: c.sessionId,
    });
    return reply.code(201).send(NoteResponse.parse(res));
  });

  app.post("/notes/:memory_id/feedback", async (req) => {
    const c = app.ctx;
    if (!c.ports.memory.enabled) throw fail("hmem_disabled", "Analyst notes are not enabled in this build.");
    const { memory_id } = parse(FeedbackParams, req.params);
    const body = parse(FeedbackBody, req.body);
    return FeedbackResponse.parse(await c.ports.memory.feedback(memory_id, body.kind, body.by));
  });
}

/** When the request reached us: the persisted run state, else the ERP row, else the demo manifest. */
async function receivedAt(app: FastifyInstance, requestId: string, runId: string): Promise<string | null> {
  const st = app.ctx.registry.stateOf(runId);
  if (st?.received_at) return st.received_at;
  const row = (await loadErp(app.ctx.config)).requests.find((r) => r.request_id === requestId);
  if (row) return row.received_at;
  return readManifest(app.ctx.config).find((m) => m.request_id === requestId)?.received_at ?? null;
}
