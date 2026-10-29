// POST /run (06 §4.2): zod-validated, input resolved inside the example/upload directories, then handed to the run registry.
// Synchronous by default (waits up to budget + 30 s); options.async returns 202 with the ids. A run-level failure returns the
// run error envelope. The same route serves curl (-d @file, form content-type) and the UI.
import type { FastifyInstance } from "fastify";
import { liveMissing } from "../../config/env";
import { RunRequest } from "../../schemas/api";
import { ERROR_TEXT } from "../../schemas/errors";
import { fail, parse } from "../error-handler";
import { resolveInput } from "../resolve-input";

const RUN_BODY_LIMIT = 25 * 1024 * 1024;

export const httpStatusForEnvelope = (code: string): number =>
  ["zetaris_unavailable", "erp_unavailable", "live_unconfigured", "interrupted"].includes(code) ? 503 : code === "invalid_input" ? 400 : 500;

const accepted = (s: { run_id: string; trace_id: string }) => ({
  run_id: s.run_id,
  status: "running" as const,
  trace_id: s.trace_id,
  events_url: `/runs/${s.run_id}/events`,
  result_url: `/runs/${s.run_id}`,
});

export function registerRun(app: FastifyInstance): void {
  app.post("/run", { bodyLimit: RUN_BODY_LIMIT }, async (req, reply) => {
    const cfg = app.ctx.config;
    if (req.body === undefined || req.body === null) throw fail("invalid_input", "input: a JSON body is required.");
    const body = parse(RunRequest, req.body);
    const wantsSample = body.options.sample_mode === true;
    if (cfg.SAMPLE_MODE && body.options.sample_mode === false)
      throw fail("live_unavailable", "This server is running in SAMPLE_MODE; live runs are not available.");
    if (body.options.simulate_outage?.length && !cfg.ENABLE_TEST_HOOKS)
      throw fail("invalid_input", "options.simulate_outage: test hooks are disabled on this server.");
    if (!cfg.SAMPLE_MODE && !wantsSample && liveMissing(cfg).length) throw fail("live_unconfigured", `${ERROR_TEXT.live_unconfigured} Missing: ${liveMissing(cfg).join(", ")}.`);

    const { input, input_ref } = resolveInput(cfg, app.ctx.registry, body.input);
    const started = await app.ctx.registry.start({ input, options: body.options, run_id: body.run_id, input_ref });

    if (body.options.async) {
      return reply.code(202).send(accepted(started));
    }
    const waitMs = ((body.options.budget_seconds ?? cfg.RUN_BUDGET_SECONDS) + 30) * 1000;
    const timer = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), waitMs).unref());
    const env = await Promise.race([started.done, timer]);
    if (env === "timeout")
      return reply.code(202).send(accepted(started));
    return reply.code(env.status === "error" ? httpStatusForEnvelope(env.code) : 200).send(env);
  });
}
