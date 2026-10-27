// GET /requests (api-depth): history_run for closed ERP rows, and one bad row never blanks the inbox.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxItem } from "../../../app/schemas/api-routes";
import { makeHarness, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let h: Harness;
afterEach(async () => {
  await h?.close();
});

const row = (request_id: string, status: string, received_at: string, extra: Record<string, unknown> = {}) => ({
  request_id,
  vendor_id: "V-10001",
  candidate_vendor_ids: "",
  claimed_name: "Tidewater Cable & Conduit LLC",
  claimed_remit_line1: null,
  new_routing: "110000000",
  new_account_hash: "a".repeat(64),
  sender_domain: "tidewater.example",
  received_at,
  channel: "email",
  status,
  data_origin: "SYNTHETIC",
  ...extra,
});
const runs = [
  { payment_run_id: "PR-2026-09-29", scheduled_date: "2026-09-29", cutoff_local: "14:00 ET", status: "released" },
  { payment_run_id: "PR-2026-10-06", scheduled_date: "2026-10-06", cutoff_local: "14:00 ET", status: "released" },
  { payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" },
];

async function seed(requests: unknown[]): Promise<Array<Record<string, unknown>>> {
  h = await makeHarness();
  mkdirSync(path.join(h.dirs.sample, "erp"), { recursive: true });
  writeFileSync(path.join(h.dirs.sample, "erp", "bank_change_request.json"), JSON.stringify(requests));
  writeFileSync(path.join(h.dirs.sample, "erp", "payment_run.json"), JSON.stringify(runs));
  writeFileSync(
    path.join(h.dirs.sample, "erp", "payment_run_item.json"),
    JSON.stringify([{ payment_run_id: "PR-2026-10-30", vendor_id: "V-10001" }]),
  );
  const r = await h.app.inject({ method: "GET", url: "/requests" });
  expect(r.statusCode).toBe(200);
  return JSON.parse(r.body) as Array<Record<string, unknown>>;
}

describe("history_run", () => {
  it("closed rows get the earliest released run on or after the request day (within 14 days), else null; open rows omit it", async () => {
    const inbox = await seed([
      row("BCR-2026-0301", "applied", "2026-09-30T10:00:00Z"),
      row("BCR-2026-0302", "rejected", "2026-09-25T10:00:00Z"),
      row("BCR-2026-0303", "withdrawn", "2026-03-04T10:00:00Z"),
      row("BCR-2026-0304", "pending", "2026-10-26T10:00:00Z"),
      row("BCR-2026-0305", "held", "2026-09-26T10:00:00Z"),
    ]);
    const by = (id: string) => inbox.find((i) => i.request_id === id)!;
    expect(by("BCR-2026-0301").history_run).toEqual({ payment_run_id: "PR-2026-10-06", scheduled_date: "2026-10-06" });
    expect(by("BCR-2026-0302").history_run).toEqual({ payment_run_id: "PR-2026-09-29", scheduled_date: "2026-09-29" });
    expect(by("BCR-2026-0303").history_run).toBeNull();
    expect("history_run" in by("BCR-2026-0304")).toBe(false);
    expect("history_run" in by("BCR-2026-0305")).toBe(false);
    for (const i of inbox) expect(InboxItem.safeParse(i).success).toBe(true);
  });
});

describe("a bad row never blanks the inbox", () => {
  it("skips a row whose id is out of pattern or whose fields are unreadable, and still returns the rest", async () => {
    const inbox = await seed([
      row("BCR-2026-0301", "applied", "2026-09-30T10:00:00Z"),
      row("not-a-request-id", "applied", "2026-09-30T10:00:00Z"),
      row("BCR-2026-0399", "pending", "2026-10-01T10:00:00Z", { candidate_vendor_ids: null }),
      { ...row("BCR-2026-0398", "pending", "2026-10-01T10:00:00Z"), received_at: null },
    ]);
    expect(inbox.map((i) => i.request_id).sort()).toEqual(["BCR-2026-0301", "BCR-2026-0399"]);
  });
});
