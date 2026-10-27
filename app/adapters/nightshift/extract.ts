// Pulling structured content out of model text (05 §4.7). <think> blocks are stripped, tool calls are read from the native
// field first and the Nemotron chat-template tags second, and JSON is taken from the LAST balanced {...} that parses
// (Ultra's reasoning can precede the answer in prose). Prose is never parsed.
import type { ParsedToolCall } from "../../schemas/models";

const THINK = /<think>([\s\S]*?)<\/think>/gi;

/** Remove <think> blocks (and a dangling unclosed one); returns the text and how many characters were reasoning. */
export function stripThink(text: string): { text: string; chars: number } {
  let chars = 0;
  let out = text.replace(THINK, (_m, inner: string) => {
    chars += inner.length;
    return "";
  });
  const open = out.search(/<think>/i);
  if (open >= 0) {
    chars += out.length - open - 7;
    out = out.slice(0, open);
  }
  return { text: out.trim(), chars };
}

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
export const stripFences = (s: string): string => {
  const m = s.trim().match(FENCE);
  return m?.[1] ?? s.trim();
};

/** All top-level balanced {...} spans of `text`, ignoring braces inside strings. */
export function balancedObjects(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) spans.push(text.slice(start, i + 1));
    }
  }
  return spans;
}

export function parseJsonSafe(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** The JSON object in `text`: the whole text when it parses as an object, else the last balanced {...} that does. */
export function lastJsonObject(text: string): Record<string, unknown> | undefined {
  const cleaned = stripFences(stripThink(text).text);
  const whole = parseJsonSafe(cleaned);
  if (whole && typeof whole === "object" && !Array.isArray(whole)) return whole as Record<string, unknown>;
  for (const span of balancedObjects(cleaned).reverse()) {
    const v = parseJsonSafe(span);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return undefined;
}

type RawCall = { id?: string; type?: string; function?: { name?: string; arguments?: unknown }; name?: string; arguments?: unknown };

function toParsed(raw: RawCall, i: number, path: ParsedToolCall["parse_path"]): ParsedToolCall | null {
  const name = raw.function?.name ?? raw.name;
  if (!name) return null;
  let args: unknown = raw.function?.arguments ?? raw.arguments ?? {};
  if (typeof args === "string") args = parseJsonSafe(args) ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) args = {};
  return { id: raw.id ?? `call_${i}`, name, arguments: args as Record<string, unknown>, parse_path: path };
}

/** Tool calls in order: native, then <TOOLCALL>[...] / <tool_call>{...}, then (expect tool_calls) a JSON plan in content. */
export function parseToolCalls(native: unknown, content: string, allowPlan: boolean): ParsedToolCall[] {
  if (Array.isArray(native) && native.length) {
    const calls = native.map((c, i) => toParsed(c as RawCall, i, "native")).filter((c): c is ParsedToolCall => !!c);
    if (calls.length) return calls;
  }
  const tagged: ParsedToolCall[] = [];
  for (const m of content.matchAll(/<TOOLCALL>([\s\S]*?)<\/TOOLCALL>/gi)) {
    const v = parseJsonSafe(m[1]!.trim());
    for (const c of Array.isArray(v) ? v : [v]) {
      const p = c && typeof c === "object" ? toParsed(c as RawCall, tagged.length, "toolcall_tag") : null;
      if (p) tagged.push(p);
    }
  }
  for (const m of content.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/gi)) {
    const v = parseJsonSafe(m[1]!.trim());
    const p = v && typeof v === "object" ? toParsed(v as RawCall, tagged.length, "toolcall_tag") : null;
    if (p) tagged.push(p);
  }
  if (tagged.length || !allowPlan) return tagged;
  const obj = lastJsonObject(content);
  const list = (obj?.tool_calls ?? obj?.steps ?? obj?.calls) as unknown;
  if (Array.isArray(list))
    return list.map((c, i) => toParsed(c as RawCall, i, "json_plan")).filter((c): c is ParsedToolCall => !!c);
  return [];
}

export const withoutToolTags = (s: string): string =>
  s.replace(/<TOOLCALL>[\s\S]*?<\/TOOLCALL>/gi, "").replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "").trim();
