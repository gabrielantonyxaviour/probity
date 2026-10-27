import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeHarness, post, waitFor, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let h: Harness;
afterEach(async () => {
  await h?.close();
});

type Ev = { id: number; event: string; data: unknown };
async function readEvents(url: string, headers: Record<string, string> = {}, stopAfter?: (e: Ev) => boolean): Promise<{ events: Ev[]; headers: Headers; status: number }> {
  const res = await fetch(url, { headers });
  const events: Ev[] = [];
  if (!res.body) return { events, headers: res.headers, status: res.status };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const id = block.match(/^id: (\d+)$/m)?.[1];
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (id && event && data) {
        const ev = { id: Number(id), event, data: JSON.parse(data) as unknown };
        events.push(ev);
        if (stopAfter?.(ev)) {
          await reader.cancel();
          return { events, headers: res.headers, status: res.status };
        }
      }
    }
  }
  return { events, headers: res.headers, status: res.status };
}
const base = async (app: Harness["app"]): Promise<string> => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
};
const typed = { input: { vendor: { legal_name: "Parsons Corporation" } }, options: {} };

describe("GET /runs/:id/events (SSE, 06 §4.4)", () => {
  it("streams stage, trace, decision and done with the right headers; ids are the bus counter; the stream closes after done", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    h = await makeHarness({ script: () => gate });
    const url = await base(h.app);
    const a = (await (await fetch(`${url}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...typed, options: { async: true } }) })).json()) as { run_id: string };
    const reading = readEvents(`${url}/runs/${a.run_id}/events`);
    await new Promise((r) => setTimeout(r, 50));
    release();
    const { events, headers, status } = await reading;
    expect(status).toBe(200);
    expect(headers.get("content-type")).toContain("text/event-stream");
    expect(headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(headers.get("x-accel-buffering")).toBe("no");
    const names = events.map((e) => e.event);
    expect(names[0]).toBe("trace"); // run_start from the orchestrator
    expect(names).toContain("stage");
    expect(names).toContain("decision");
    expect(names.at(-1)).toBe("done");
    expect(events.map((e) => e.id)).toEqual(events.map((_e, i) => i + 1));
    const trace = events.filter((e) => e.event === "trace").map((e) => (e.data as { seq: number }).seq);
    expect(trace).toEqual([1, 2]); // the trace seq stays contiguous and separate from the bus id
    expect((events.at(-1)!.data as { status: string }).status).toBe("success");
  });
  it("Last-Event-ID replays only what came after", async () => {
    h = await makeHarness();
    const url = await base(h.app);
    const run = (await (await fetch(`${url}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(typed) })).json()) as { run_id: string };
    const all = await readEvents(`${url}/runs/${run.run_id}/events`);
    const after = await readEvents(`${url}/runs/${run.run_id}/events`, { "last-event-id": String(all.events[1]!.id) });
    expect(after.events.map((e) => e.id)).toEqual(all.events.slice(2).map((e) => e.id));
    expect(after.events.at(-1)!.event).toBe("done");
  });
  it("a finished run that is only on disk replays its trace file as trace events, then done", async () => {
    h = await makeHarness();
    const first = await (await post(h, "/run", typed)).json();
    h = await h.restart();
    const url = await base(h.app);
    const { events } = await readEvents(`${url}/runs/${(first as { run_id: string }).run_id}/events`);
    expect(events.map((e) => e.event)).toEqual(["trace", "trace", "done"]);
    expect((events[0]!.data as { seq: number }).seq).toBe(1);
  });
  it("404 for an unknown run; refuses the 21st viewer of a running run", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    h = await makeHarness({ script: () => gate });
    const url = await base(h.app);
    expect((await fetch(`${url}/runs/r-nope-0001/events`)).status).toBe(404);
    const a = (await (await fetch(`${url}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...typed, options: { async: true } }) })).json()) as { run_id: string };
    const ctrls = Array.from({ length: 20 }, () => new AbortController());
    const opens = ctrls.map((c) => fetch(`${url}/runs/${a.run_id}/events`, { signal: c.signal }));
    await Promise.all(opens);
    await waitFor(() => h.app.ctx.registry.isRunning(a.run_id));
    const extra = await fetch(`${url}/runs/${a.run_id}/events`);
    expect(extra.status).toBe(429);
    for (const c of ctrls) c.abort();
    release();
  });
});
