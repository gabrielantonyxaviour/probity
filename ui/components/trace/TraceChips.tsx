"use client";
import type { TraceEvent } from "@/lib/contracts";
import { Chip } from "@/components/ui/chip";
import { TRACE } from "@/lib/copy";
import { agentDisplay } from "@/lib/labels-trace";
import { modelChip, recheckChip, zetarisChip } from "@/lib/model/trace";
import type { AgentName } from "@schemas/trace";
import { useReview } from "@/components/review/review-context";

export function Monogram({ agent, onClick, active }: { agent: AgentName; onClick?: () => void; active?: boolean }) {
  const d = agentDisplay(agent);
  const cls = `mono-box ${d.agent ? "" : "mono-box--code"}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={`${d.name}: filter the trace`} aria-pressed={active} data-agent={agent} data-testid="handoff-step" style={active ? { background: "var(--bg-active)" } : undefined}>{d.mono}</button>
  ) : (
    <span className={cls} aria-hidden>{d.mono}</span>
  );
}

export function ModelChip({ ev }: { ev: TraceEvent }) {
  const { sample } = useReview();
  const m = modelChip(ev, sample);
  if (!m) return null;
  if (m.sample) return <Chip wrap>{m.lane} · {m.model}</Chip>;
  return (
    <Chip wrap tone={m.nemotron ? "agree" : "gap"} glyph={m.nemotron ? "✓" : "○"} data={{ model: ev.model ?? undefined }} testId="model-chip">
      {m.lane} · {m.model}{m.seconds ? ` · ${m.seconds}` : ""} · {m.tokens} · {m.nemotron ? "Nemotron" : "Not Nemotron"}
    </Chip>
  );
}

export function ZetarisChip({ ev }: { ev: TraceEvent }) {
  const { openQuery } = useReview();
  const z = zetarisChip(ev);
  if (!z) return null;
  const text = z.ddl && ev.note ? TRACE.ddl(z.id, ev.note) : [`Zetaris · ${z.label}${z.id ? ` (${z.id})` : ""}`, z.rows, z.mode, z.latency, z.q ? `q ${z.q}` : null].filter(Boolean).join(" · ");
  const inner = <Chip wrap tone="real" glyph="●" testId="zetaris-chip">{text}</Chip>;
  return z.queryId ? (
    <button type="button" className="inline-flex text-left" onClick={() => openQuery(z.queryId!)} aria-label={`Open query ${z.id}`} data-query-id={z.queryId}>{inner}</button>
  ) : inner;
}

export function EngineChip({ ev }: { ev: TraceEvent }) {
  if (!ev.engine) return null;
  return <Chip>{ev.engine === "world_model" ? "World Model" : "H-MEM"}{ev.engine_op ? ` · ${ev.engine_op}` : ""}</Chip>;
}

export function RecheckChip({ ev }: { ev: TraceEvent }) {
  const r = recheckChip(ev);
  if (!r) return null;
  return <Chip tone={r.ok ? "agree" : "conflict"} glyph={r.ok ? "✓" : "✕"} testId="recheck-chip">{r.text}</Chip>;
}

export function MetaChips({ ev }: { ev: TraceEvent }) {
  return (
    <>
      {ev.rule ? <Chip tone="gap" glyph="○">{TRACE.rule(ev.rule)}</Chip> : null}
      {ev.codes.length ? <Chip>{TRACE.codes(ev.codes.join(" "))}</Chip> : null}
      {ev.confidence != null && ev.agent_name !== "gate_officer" ? <Chip>{TRACE.confidence(ev.confidence.toFixed(2))}</Chip> : null}
    </>
  );
}
