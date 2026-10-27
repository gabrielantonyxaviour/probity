// Proxy from the UI origin to the Probity API (06 section 9.2). Streams SSE, forwards uploads, allow-lists path prefixes.
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOW = new Set([
  "run",
  "runs",
  "requests",
  "uploads",
  "examples",
  "callbacks",
  "outcomes",
  "notes",
  "payment-runs",
  "health",
  "healthz",
  "readyz",
]);
const FORWARD_REQUEST = ["content-type", "last-event-id", "accept", "meterless-trace"];
const FORWARD_RESPONSE = [
  "content-type",
  "cache-control",
  "retry-after",
  "content-disposition",
  "x-accel-buffering",
  "etag",
  "last-modified",
];

function apiBase(): string {
  return (process.env.PAYEE_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
}

function allowed(segments: string[]): boolean {
  const [first, second] = segments;
  if (!first) return false;
  if (segments.some((s) => s === ".." || s === "." || s === "")) return false;
  if (first === "zetaris") return second === "rerun" && segments.length === 2;
  return ALLOW.has(first);
}

function json(status: number, body: { error: string; code: string }): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  if (!allowed(path)) return json(404, { error: "Not found.", code: "not_found" });

  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const target = `${apiBase()}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      cache: "no-store",
      signal: req.signal,
      // @ts-expect-error duplex is required by undici when streaming a request body
      duplex: hasBody ? "half" : undefined,
    });
    const out = new Headers();
    for (const h of FORWARD_RESPONSE) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    if (out.get("content-type")?.includes("text/event-stream")) {
      out.set("cache-control", "no-cache, no-transform");
      out.set("x-accel-buffering", "no");
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return new Response(null, { status: 499 });
    return json(502, { error: `Probity API did not answer at ${apiBase()}.`, code: "upstream_unreachable" });
  }
}

export { handle as GET, handle as POST, handle as HEAD };
