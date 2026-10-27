// Plain-English trace rail lines. The API writes compact machine summaries ("5768/1213 tokens, finish stop, 0 tool call(s)",
// "rows=1 vendor_id=V-10027 ..."); an AP reader sees a sentence. Pure re-wording of the same facts: unknown shapes pass
// through unchanged, and the raw event stays one click away ("Show raw event").
import type { TraceEvent } from "../contracts";
import { int } from "../format";

const KEY_WORDS: Record<string, string> = {
  vendor_id: "vendor",
  legal_name: "legal name",
  name_norm: "normalised name",
  invoice_no: "invoice",
  amount_usd: "amount",
  via: "matched by",
  key: "key",
  name: "name",
  item_id: "item",
  payment_run_id: "payment run",
  scheduled_date: "scheduled",
  matched_uei: "matched UEI",
  level: "level",
  vendor_id_on_file: "vendor on file",
  request_id: "request",
  new_routing: "new routing",
  routing_check: "routing check",
  table: "table",
  type: "type",
};

const FINISH: Record<string, string> = {
  stop: "",
  tool_calls: "and chose the next check",
  length: "and hit the length limit",
  content_filter: "and was cut off by a content filter",
};

function seconds(s: number): string {
  if (s < 90) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** "a=1 b=two words c=3" to "a 1 · b two words · c 3" with plain key words. */
function keyValues(rest: string): string {
  const parts = rest.split(/\s+(?=[a-z_]+=)/);
  return parts
    .map((p) => {
      const m = /^([a-z_]+)=(.*)$/.exec(p);
      if (!m) return p;
      const v = m[2]!.trim();
      return `${KEY_WORDS[m[1]!] ?? m[1]!.replace(/_/g, " ")} ${v}`;
    })
    .join(" · ");
}

function tokens(ev: TraceEvent, s: string): string | null {
  const m = /^(\d+)\/(\d+) tokens, finish (\w+), (\d+) tool call\(s\)$/.exec(s);
  if (!m) return null;
  const [, tin, tout, finish, tools] = m;
  const who = ev.model && /nemotron/i.test(ev.model) ? "Nemotron" : "The model";
  const tail = FINISH[finish!] ?? `(finish: ${finish})`;
  const toolText = Number(tools) > 0 && finish !== "tool_calls" ? ` and asked for ${tools} tool call${tools === "1" ? "" : "s"}` : "";
  return `${who} read ${int(Number(tin))} tokens and wrote ${int(Number(tout))}${toolText}${tail ? ` ${tail}` : ""}.`;
}

const RULES: Array<[RegExp, (m: RegExpExecArray, ev: TraceEvent) => string]> = [
  [/^mode=(\w+) budget=(\d+)s$/, (m) => `${m[1] === "live" ? "Live run" : `Run in ${m[1]} mode`}, ${seconds(Number(m[2]))} time budget.`],
  [/^rows=0$/, () => "No rows returned."],
  [/^rows=(\d+)$/, (m) => `${m[1]} row${m[1] === "1" ? "" : "s"} returned.`],
  [/^rows=(\d+) (.+)$/, (m) => `${m[1]} row${m[1] === "1" ? "" : "s"}: ${keyValues(m[2]!)}`],
  [/^(\d+) hits?$/, (m) => (m[1] === "0" ? "Nothing remembered about these details from earlier checks." : `${m[1]} earlier finding${m[1] === "1" ? "" : "s"} recalled.`)],
  [/^entities 0, edges 0, facts 0 written; (\d+) unchanged$/, (m) => `Nothing new to remember; ${m[1]} facts were already known.`],
  [/^entities (\d+), edges (\d+), facts (\d+) written; (\d+) unchanged$/, (m) => `Remembered ${m[1]} entities, ${m[2]} links and ${m[3]} facts; ${m[4]} already known.`],
  [/^(\d+) sentences?$/, (m) => `Wrote a ${m[1]}-sentence summary.`],
  [/^passed: (\d+) tokens checked, 0 unknown(, grounded in the decision)?$/, (m) => `Passed: all ${m[1]} numbers and names in the summary match the decision${m[2] ? " and its evidence" : ""}.`],
  [/^regenerated: (\d+) tokens checked, 0 unknown(, grounded in the decision)?$/, (m) => `Passed on the second draft: all ${m[1]} numbers and names match the decision.`],
  [/^fallback(:.*)?$/, () => "The summary was written from the decision itself (template), not by the model."],
  [/^(DQ\d+) table-wide total=(\d+) valid=(\d+) invalid=(\d+); in (PR-[\d-]+): (\d+)$/, (m) => `${m[1]} checked all ${m[2]} payment items: ${m[4]} fail${m[4] === "1" ? "s" : ""}, ${m[6]} of them in ${m[5]}.`],
  [/^(\w+) -> (\w+)$/, (m) => `Handed ${m[1]!.replace(/_/g, " ")} on.`],
  [/^(HOLD|APPROVE|CALLBACK_VERIFY) in ([\d.]+)s; trace .+$/, (m) => `${m[1] === "CALLBACK_VERIFY" ? "Call back first" : m[1] === "HOLD" ? "Hold" : "Approve"}, decided in ${seconds(Number(m[2]))}.`],
  [/^r(\d+): floor (\d+) steps \+ (\d+) extra step\(s\)(.*)$/, (m) => `Round ${m[1]} plan: ${m[2]} required checks${m[3] === "0" ? ", no extra steps" : ` plus ${m[3]} extra`}${m[4]!.trim() ? ` ${m[4]!.trim()}` : ""}.`],
];

/** The line shown in the trace rail for one event. */
export function humanSummary(ev: TraceEvent): string {
  const s = ev.output_summary.trim();
  if (!s) return s;
  const t = tokens(ev, s);
  if (t) return t;
  for (const [re, fn] of RULES) {
    const m = re.exec(s);
    if (m) return fn(m, ev);
  }
  return s;
}
