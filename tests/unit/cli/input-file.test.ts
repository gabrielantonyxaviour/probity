import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliInputError, buildRunBody, parseRemit } from "../../../app/cli/input-file";

const root = mkdtempSync(path.join(os.tmpdir(), "probity-cli-"));
const examples = path.join(root, "input_examples");
mkdirSync(path.join(examples, "01-booz-allen-remit-change"), { recursive: true });
writeFileSync(path.join(examples, "01-booz-allen-remit-change", "letter.pdf"), Buffer.from("%PDF-1.4 test"));
writeFileSync(path.join(examples, "01-booz-allen-remit-change", "headers.eml"), "From: a@b.example\n\n");
writeFileSync(path.join(examples, "01-booz-allen-remit-change", "request.json"), JSON.stringify({ input: { example_id: "01-booz-allen-remit-change", request_id: "BCR-2026-0412", documents: [{ kind: "letter", file: "letter.pdf" }, { kind: "eml_headers", file: "headers.eml" }] }, options: {} }));
const cfg = { dirs: { examples } };

describe("probity run input building (06 §5)", () => {
  it("needs exactly one of --input, --example, --name/--uei/--cik", () => {
    expect(() => buildRunBody({}, cfg)).toThrow(CliInputError);
    expect(() => buildRunBody({ input: "x", example: "y" }, cfg)).toThrow(/exactly one/);
  });
  it("--example reads the example's request.json and keeps file references the server can resolve itself", () => {
    const { body } = buildRunBody({ example: "01-booz-allen-remit-change" }, cfg);
    expect(body.input.example_id).toBe("01-booz-allen-remit-change");
    expect(body.input.documents?.[0]).toEqual({ kind: "letter", file: "letter.pdf" });
  });
  it("--input <dir> reads <dir>/request.json; references outside INPUT_EXAMPLES_DIR are sent as DocInline", () => {
    const other = mkdtempSync(path.join(os.tmpdir(), "probity-other-"));
    writeFileSync(path.join(other, "letter.pdf"), Buffer.from("%PDF-1.4 other"));
    writeFileSync(path.join(other, "request.json"), JSON.stringify({ input: { request_id: "BCR-2026-0600", documents: [{ kind: "letter", file: "letter.pdf" }] }, options: {} }));
    const { body } = buildRunBody({ input: other }, cfg);
    const doc = body.input.documents?.[0] as { filename: string; content_base64: string };
    expect(doc.filename).toBe("letter.pdf");
    expect(Buffer.from(doc.content_base64, "base64").toString()).toBe("%PDF-1.4 other");
  });
  it("a bare input object and a full body are both accepted", () => {
    const f = path.join(root, "bare.json");
    writeFileSync(f, JSON.stringify({ vendor: { legal_name: "Parsons Corporation" } }));
    expect(buildRunBody({ input: f }, cfg).body.input.vendor?.legal_name).toBe("Parsons Corporation");
  });
  it("--name/--uei/--cik build a vendor-only (name-only) input; claim flags build typed claims", () => {
    expect(buildRunBody({ name: "Parsons Corporation", uei: "JCBMLGPE6Z71", cik: "1443646" }, cfg).body.input.vendor).toEqual({ legal_name: "Parsons Corporation", uei: "JCBMLGPE6Z71", cik: "0001443646" });
    const typed = buildRunBody({ name: "L3Harris Technologies, Inc.", "claim-routing": "110000000", "claim-account": "000999000205", "claim-email": "treasury@l3harris.example", "claim-remit": "1025 W NASA Blvd, Melbourne, fl 32919" }, cfg).body.input.claims;
    expect(typed?.bank).toEqual({ routing: "110000000", account_number: "000999000205" });
    expect(typed?.remit_address).toEqual({ line1: "1025 W NASA Blvd", city: "Melbourne", state: "FL", zip: "32919" });
  });
  it("applies --payment-run, --received-at, --simulate-outage, --sample, --budget and validates with the API schema", () => {
    const { body } = buildRunBody({ name: "Parsons Corporation", "payment-run": "PR-2026-10-30", "received-at": "2026-10-22T15:12:00Z", "simulate-outage": "usaspending,edgar", sample: true, budget: "120" }, cfg);
    expect(body.input.payment_run_id).toBe("PR-2026-10-30");
    expect(body.options).toMatchObject({ simulate_outage: ["usaspending", "edgar"], sample_mode: true, budget_seconds: 120 });
    expect(() => buildRunBody({ name: "Parsons Corporation", uei: "bad" }, cfg)).toThrow(/uei/);
    expect(() => buildRunBody({ name: "Parsons Corporation", "claim-account": "123456789012" }, cfg)).toThrow(/account_number|bank/);
  });
  it("parseRemit", () => {
    expect(parseRemit("1 Commvault Way Ste 205, Tinton Falls, NJ 07724")).toEqual({ line1: "1 Commvault Way Ste 205", city: "Tinton Falls", state: "NJ", zip: "07724" });
    expect(() => parseRemit("nonsense")).toThrow(CliInputError);
  });
});
