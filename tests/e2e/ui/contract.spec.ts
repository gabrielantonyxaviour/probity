import { test, expect } from "@playwright/test";
import { getJson } from "../helpers/api";

const REQUEST_KEYS = ["request_id", "claimed_name", "received_at", "change_kinds", "channel", "payment_run_id", "synthetic", "latest_run"];

test("GET /requests returns the inbox shape", async ({ request }) => {
  const { status, body } = await getJson(request, "/requests");
  expect(status).toBe(200);
  expect(Array.isArray(body)).toBe(true);
  const items = body as Record<string, unknown>[];
  expect(items.length).toBeGreaterThan(0);
  for (const key of REQUEST_KEYS) expect(items[0], key).toHaveProperty(key);
  expect(Array.isArray(items[0].change_kinds)).toBe(true);
});

test("an unknown run returns {error, code}", async ({ request }) => {
  const { status, body } = await getJson(request, "/runs/r-missing-e2e-run");
  expect(status).toBe(404);
  const err = body as { error?: unknown; code?: unknown; stack?: unknown };
  expect(typeof err.error).toBe("string");
  expect(typeof err.code).toBe("string");
  expect(err.stack).toBeUndefined();
  expect(Object.keys(err).sort()).toEqual(["code", "error"]);
});
