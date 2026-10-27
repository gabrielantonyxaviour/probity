import { describe, expect, it } from "vitest";
import { normalizeBaseUrl } from "../../../app/adapters/nightshift/url";

describe("normalizeBaseUrl (05 §4.2)", () => {
  const want = "http://127.0.0.1:8088/v1";
  it.each([
    ["127.0.0.1:8088", want],
    ["http://127.0.0.1:8088/", want],
    ["http://127.0.0.1:8088/v1", want],
    ["http://127.0.0.1:8088/v1/", want],
    ["http://127.0.0.1:8088/v1/chat/completions", want],
    ["http://127.0.0.1:8088/v1/models", want],
    ["http://127.0.0.1:8088/healthz", want],
    ["  http://127.0.0.1:8088  ", want],
    ["http://[::1]:8088", "http://[::1]:8088/v1"],
    ["host.docker.internal:8088", "http://host.docker.internal:8088/v1"],
  ])("%s", (raw, expected) => {
    expect(normalizeBaseUrl(raw)).toBe(expected);
  });
  it("never produces /v1/v1", () => {
    expect(normalizeBaseUrl("http://h:1/v1/v1")).not.toMatch(/\/v1\/v1\/v1/);
    expect(normalizeBaseUrl("http://h:1/v1")).toBe("http://h:1/v1");
  });
});
