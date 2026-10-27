import { describe, expect, it } from "vitest";
import { parseResponse } from "../../../app/adapters/nightshift/response";
import { balancedObjects, lastJsonObject, parseToolCalls, stripThink } from "../../../app/adapters/nightshift/extract";
import { receiptBody } from "../../helpers/nightshift-mock";

const H = (h: Record<string, string> = {}) => new Headers(h);

describe("response parsing (05 §4.7)", () => {
  it("takes the model from the body, then the receipt, then a header, else null", () => {
    expect(parseResponse(receiptBody(), H(), { expect: "text" })).toMatchObject({ model: "nvidia/nemotron-3.5-lightning-30b-a3b", model_source: "response_body" });
    const noBody = parseResponse(receiptBody({ omitModel: true }), H(), { expect: "text" });
    expect(noBody).toMatchObject({ model_source: "receipt", model: "nvidia/nemotron-3.5-lightning-30b-a3b" });
    const raw = receiptBody({ omitModel: true }) as { meterless: Record<string, unknown> };
    delete raw.meterless.routed_model;
    delete raw.meterless.provider_model;
    (raw.meterless.receipt as Record<string, unknown>).routed_model = undefined;
    expect(parseResponse(raw, H({ "x-served-model": "nvidia/nemotron-3-ultra-550b-a55b" }), { expect: "text" })).toMatchObject({ model_source: "response_header", model: "nvidia/nemotron-3-ultra-550b-a55b" });
    expect(parseResponse(raw, H(), { expect: "text" })).toMatchObject({ model: null, model_source: "none" });
  });
  it("decides nemotron from the receipt's winning route, not the echoed pin", () => {
    const p = parseResponse(receiptBody({ model: "nvidia/nemotron-3.5-lightning-30b-a3b", routed: "anthropic/claude-haiku" }), H(), { expect: "text" });
    expect(p.nemotron).toBe(false);
    expect(p.route_model).toBe("anthropic/claude-haiku");
  });
  it("strips <think>, counts reasoning chars, never copies requested_model", () => {
    const p = parseResponse(receiptBody({ content: "<think>weigh the options</think>READY" }), H(), { expect: "text" });
    expect(p.content).toBe("READY");
    expect(p.reasoning_chars).toBe("weigh the options".length);
  });
  it("returns null usage when absent (never estimated)", () => {
    const raw = receiptBody() as { usage?: unknown };
    delete raw.usage;
    const p = parseResponse(raw, H(), { expect: "text" });
    expect(p.tokens_in).toBeNull();
    expect(p.tokens_out).toBeNull();
  });
  it("parses JSON output: passed validation, forced submit_ tool call, then the last balanced object", () => {
    const passed = parseResponse(receiptBody({ content: '{"a":1}', validation: "passed" }), H(), { expect: "json" });
    expect(passed).toMatchObject({ json: { a: 1 }, json_path: "content" });
    const tc = [{ id: "c1", type: "function", function: { name: "submit_x", arguments: '{"b":2}' } }];
    expect(parseResponse(receiptBody({ content: null, tool_calls: tc }), H(), { expect: "json" })).toMatchObject({ json: { b: 2 }, json_path: "tool_call" });
    const prose = parseResponse(receiptBody({ content: 'The user wants {braces} then final: {"c":3}' }), H(), { expect: "json" });
    expect(prose).toMatchObject({ json: { c: 3 }, json_path: "balanced" });
    expect(parseResponse(receiptBody({ content: "no json here" }), H(), { expect: "json" }).json).toBeNull();
  });
  it("reads <TOOLCALL> and <tool_call> tags and a JSON plan", () => {
    expect(parseToolCalls(undefined, '<TOOLCALL>[{"name":"run_template","arguments":{"template_id":"T01"}}]</TOOLCALL>', false)[0]).toMatchObject({ name: "run_template", parse_path: "toolcall_tag" });
    expect(parseToolCalls(undefined, '<tool_call>{"name":"a","arguments":"{\\"k\\":1}"}</tool_call>', false)[0]?.arguments).toEqual({ k: 1 });
    expect(parseToolCalls(undefined, '{"tool_calls":[{"name":"x","arguments":{}}]}', true)[0]).toMatchObject({ parse_path: "json_plan" });
    expect(parseToolCalls(undefined, '{"tool_calls":[{"name":"x","arguments":{}}]}', false)).toEqual([]);
  });
  it("flags cross-check blocks and requires_review", () => {
    expect(parseResponse(receiptBody({ cross: { status: "blocked", risk_level: "high", recommended_action: "block" } }), H(), { expect: "text" }).blocked).toBe(true);
    expect(parseResponse(receiptBody({ cross: { status: "x", risk_level: "medium", recommended_action: "require_approval" } }), H(), { expect: "text" }).blocked).toBe(true);
    expect(parseResponse(receiptBody({ finish: "requires_review" }), H(), { expect: "text" }).blocked).toBe(true);
    expect(parseResponse(receiptBody({ cross: { status: "x", risk_level: "critical", recommended_action: "allow" } }), H(), { expect: "text" }).blocked).toBe(true);
    expect(parseResponse(receiptBody(), H(), { expect: "text" }).blocked).toBe(false);
  });
  it("persists no prompt text in the receipt", () => {
    const p = parseResponse(receiptBody(), H(), { expect: "text" });
    expect(JSON.stringify(p.receipt)).not.toContain("000999000141");
    expect(p.receipt?.prompt_preview).toContain("omitted");
  });
  it("extract helpers", () => {
    expect(stripThink("a<think>b</think>c").text).toBe("ac");
    expect(stripThink("a<think>unclosed").text).toBe("a");
    expect(balancedObjects('x {"a":"}"} y {"b":1}')).toEqual(['{"a":"}"}', '{"b":1}']);
    expect(lastJsonObject('```json\n{"z":1}\n```')).toEqual({ z: 1 });
  });
});
