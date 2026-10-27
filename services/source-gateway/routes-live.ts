// Live pass-through routes: USAspending recipient detail and children, EDGAR submissions and tickers.
import type { FastifyInstance } from "fastify";
import { flatRecipient, wrapChildren } from "./flat";
import { parse, Params, sendJson } from "./reply";
import { tickersList, trimSubmissions } from "./trim";
import type { Upstream } from "./upstream";

export function registerLiveRoutes(app: FastifyInstance, up: Upstream): void {
  app.get("/usaspending/recipient/:recipient_id", async (req, reply) => {
    const { recipient_id } = parse(Params.recipient, req.params);
    const { shape } = parse(Params.shape, req.query);
    const got = await up.usaspending(`/api/v2/recipient/${recipient_id}/`);
    const body = got.body as Record<string, unknown>;
    return sendJson(reply, shape === "flat" ? flatRecipient(body, got.fetchedAt) : body, { mode: "passthrough", fetchedAt: got.fetchedAt, upstreamStatus: got.status });
  });
  app.get("/usaspending/children/:parent_uei", async (req, reply) => {
    const { parent_uei } = parse(Params.parent, req.params);
    const { shape } = parse(Params.shape, req.query);
    const got = await up.usaspending(`/api/v2/recipient/children/${parent_uei}/`);
    return sendJson(reply, wrapChildren(got.body, parent_uei, shape), { mode: "passthrough", fetchedAt: got.fetchedAt, upstreamStatus: got.status });
  });
  app.get("/edgar/submissions/:cik10", async (req, reply) => {
    const { cik10 } = parse(Params.cik, req.params);
    const got = await up.sec("data", `/submissions/CIK${cik10}.json`);
    return sendJson(reply, trimSubmissions(got.body as Record<string, unknown>), { mode: "passthrough", fetchedAt: got.fetchedAt, upstreamStatus: got.status });
  });
  const tickers = async (_req: unknown, reply: import("fastify").FastifyReply) => {
    const got = await up.sec("www", "/files/company_tickers.json");
    return sendJson(reply, tickersList(got.body as Record<string, unknown>), { mode: "passthrough", fetchedAt: got.fetchedAt, upstreamStatus: got.status });
  };
  app.get("/edgar/tickers", tickers);
  app.get("/sec/tickers", tickers);
}
