import { describe, expect, it } from "vitest";
import { MAX_BUFFER, MAX_SUBSCRIBERS, RunBus } from "../../../app/trace/bus";

describe("RunBus (06 §4.4, §12.2)", () => {
  it("assigns a per-run counter, replays from Last-Event-ID, then streams live", () => {
    const bus = new RunBus();
    bus.publish("r", "stage", { n: 1 });
    bus.publish("r", "stage", { n: 2 });
    const got: number[] = [];
    bus.subscribe("r", 1, (e) => got.push(e.id));
    bus.publish("r", "trace", { n: 3 });
    expect(got).toEqual([2, 3]);
  });
  it("closes on done or error, and keeps the buffer after the run ends", () => {
    const bus = new RunBus();
    bus.publish("r", "stage", {});
    expect(bus.isClosed("r")).toBe(false);
    bus.publish("r", "done", {});
    expect(bus.isClosed("r")).toBe(true);
    expect(bus.history("r")).toHaveLength(2);
  });
  it("allows 20 subscribers per run and refuses the 21st", () => {
    const bus = new RunBus();
    const unsubs = Array.from({ length: MAX_SUBSCRIBERS }, () => bus.subscribe("r", 0, () => undefined));
    expect(unsubs.every((u) => typeof u === "function")).toBe(true);
    expect(bus.subscribe("r", 0, () => undefined)).toBeNull();
    unsubs[0]!();
    expect(bus.subscribe("r", 0, () => undefined)).not.toBeNull();
  });
  it("buffers at most 2,000 events", () => {
    const bus = new RunBus();
    for (let i = 0; i < MAX_BUFFER + 50; i++) bus.publish("r", "trace", { i });
    const h = bus.history("r");
    expect(h).toHaveLength(MAX_BUFFER);
    expect(h[0]!.id).toBe(51);
  });
  it("onAny sees every run", () => {
    const bus = new RunBus();
    const seen: string[] = [];
    bus.onAny((id) => seen.push(id));
    bus.publish("a", "stage", {});
    bus.publish("b", "stage", {});
    expect(seen).toEqual(["a", "b"]);
  });
});
