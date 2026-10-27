// Server-sent events plumbing (06 §4.4): headers, the 15 s heartbeat, `id:` = the bus counter, one writer for live and disk replay.
import type { FastifyReply } from "fastify";
import type { BusEntry } from "../trace/bus";

export const HEARTBEAT_MS = 15_000;

export type SseStream = { send(e: BusEntry): void; end(): void; onClose(fn: () => void): void; readonly closed: boolean };

export function openSse(reply: FastifyReply): SseStream {
  const raw = reply.raw;
  reply.hijack();
  raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "x-accel-buffering": "no",
    connection: "keep-alive",
  });
  raw.socket?.setTimeout(0);
  raw.socket?.setNoDelay(true);
  let closed = false;
  const closers: Array<() => void> = [];
  const heartbeat = setInterval(() => {
    if (!closed) raw.write(": ping\n\n");
  }, HEARTBEAT_MS);
  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    for (const fn of closers) fn();
  };
  raw.on("close", finish);
  raw.write(": connected\n\n");
  return {
    send(e) {
      if (!closed) raw.write(`id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    },
    end() {
      if (!closed) raw.end();
      finish();
    },
    onClose: (fn) => void closers.push(fn),
    get closed() {
      return closed;
    },
  };
}
