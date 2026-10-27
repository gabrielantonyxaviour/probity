// A local node:http stand-in for Nightshift (05 §8): /v1/models and /v1/chat/completions with the response shapes the real
// runtime returns (meterless compute receipt, nested receipt, meterless_cross_check). Test-only: nothing in app/ imports it.
import http from "node:http";
import type { AddressInfo } from "node:net";

export type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> | null };
export type Reply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string>; delayMs?: number; destroy?: boolean };
export type Handler = (req: Seen, n: number) => Reply | Promise<Reply>;

export const CATALOG = [
  "meterless/auto",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3.5-bolt-e4b",
];

export function receiptBody(o: { model?: string; routed?: string; content?: string | null; tool_calls?: unknown[]; finish?: string; hmem?: number; cross?: Record<string, unknown>; validation?: string | null; omitModel?: boolean; app?: string } = {}) {
  const model = o.model ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
  const routed = o.routed ?? model;
  const cross = o.cross ?? { status: "skipped", risk_level: "low", verifier: "none", verifier_model: null, recommended_action: "allow", blocking: false };
  const nested = {
    schema: "meterless.compute_receipt.v1",
    receipt_id: "rcpt_req_test",
    app: o.app ?? "probity-test",
    prompt_preview: "Reply with the single word READY. acct 000999000141",
    winning_route: { model: routed, provider: "nvidia" },
    egress: { destination: "nvidia", sent: { prompt_chars: 33, context_sources: ["messages"] } },
    hmem: o.hmem ? { injected: o.hmem, top_score: 0.5, ids: ["mem_1"] } : { injected: 0 },
    routing: { width: 1, reason: "single-candidate", winner: routed },
    cross_check: cross,
  };
  return {
    id: "chatcmpl-test",
    ...(o.omitModel ? {} : { model }),
    choices: [{ index: 0, message: { role: "assistant", content: o.content === undefined ? "READY" : o.content, ...(o.tool_calls ? { tool_calls: o.tool_calls } : {}) }, finish_reason: o.finish ?? "stop" }],
    usage: { prompt_tokens: 117, completion_tokens: 3, total_tokens: 120 },
    meterless: {
      schema: "meterless.compute_receipt.v1",
      receipt_id: "rcpt_req_test",
      requested_model: model,
      provider_model: routed,
      routed_model: routed,
      winning_route: { model: routed },
      requires_review: false,
      receipt: nested,
      app: o.app ?? "probity-test",
      ...(o.validation === undefined ? {} : o.validation === null ? {} : { structured_output: { kind: "json_schema", strict: true, validation: o.validation } }),
    },
    meterless_cross_check: cross,
  };
}

export async function startMock(handler: Handler, token = "test-token-0001"): Promise<{ url: string; token: string; seen: Seen[]; close: () => Promise<void> }> {
  const seen: Seen[] = [];
  let chats = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", async () => {
      const body = ((): Record<string, unknown> | null => {
        try {
          return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      })();
      const entry: Seen = { method: req.method ?? "GET", url: req.url ?? "", headers: req.headers, body };
      seen.push(entry);
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "unauthorized" } }));
        return;
      }
      if (req.url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: CATALOG.map((id) => ({ id, object: "model" })) }));
        return;
      }
      const reply = await handler(entry, ++chats);
      if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
      if (reply.destroy) return void req.socket.destroy();
      res.writeHead(reply.status ?? 200, { "content-type": "application/json", ...(reply.headers ?? {}) });
      res.end(reply.text ?? JSON.stringify(reply.json ?? receiptBody()));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  return { url, token, seen, close: () => new Promise<void>((r) => {
      server.close(() => r());
      server.closeAllConnections();
    }) };
}
