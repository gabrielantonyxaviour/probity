"use client";
import { useMemo } from "react";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/tabs";
import { TRACE } from "@/lib/copy";
import { FILTERS, type TraceFilter } from "@/lib/labels-trace";
import { buildRibbon, summarize } from "@/lib/model/trace";
import type { TraceEvent } from "@/lib/contracts";
import { apiUrl } from "@/lib/api";
import { Monogram } from "./TraceChips";
import type { AgentName } from "@schemas/trace";

/** Sticky summary bar (counts, all-Nemotron chip, filters, Expand, JSONL) and the always-visible handoff ribbon. */
export function SummaryBar({ trace, filter, setFilter, onExpand, expanded, runId, agentFilter, setAgentFilter }: { trace: TraceEvent[]; filter: TraceFilter; setFilter: (f: TraceFilter) => void; onExpand: () => void; expanded: boolean; runId: string; agentFilter: AgentName | null; setAgentFilter: (a: AgentName | null) => void }) {
  const s = useMemo(() => summarize(trace), [trace]);
  const ribbon = useMemo(() => buildRibbon(trace), [trace]);
  return (
    <>
      <div className="tr__bar">
        <p className="tr__counts t-mono-label t-clamp-2" data-testid="trace-summary" title={TRACE.summary(s.agents, s.handoffs, s.challenges, s.rounds, s.queries, s.rechecks, s.registrations, s.modelCalls)}>
          {TRACE.summary(s.agents, s.handoffs, s.challenges, s.rounds, s.queries, s.rechecks, s.registrations, s.modelCalls)}
        </p>
        <div className="tr__ribbon" data-testid="handoff-ribbon" aria-label={TRACE.ribbon}>
          {ribbon.length === 0 ? <span className="t-mono-label text-fg-muted">{TRACE.ribbon}</span> : null}
          {ribbon.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1.5" data-loop-rule={n.kind === "loop" ? n.rule : undefined}>
              {i > 0 && n.kind === "agent" && ribbon[i - 1].kind === "agent" ? <span className="text-fg-muted" aria-hidden>→</span> : null}
              {n.kind === "loop" ? <Chip tone="gap" glyph="⟲">{n.rule}</Chip> : <Monogram agent={n.agent} active={agentFilter === n.agent} onClick={() => setAgentFilter(agentFilter === n.agent ? null : n.agent)} />}
            </span>
          ))}
        </div>
      </div>
      <div className="tr__tools">
        <div className="tr__row1">
          {s.modelCalls > 0 ? (
            s.notNemotron === 0 ? <Chip tone="agree" glyph="✓" testId="all-nemotron">{TRACE.allNemotron}</Chip> : <Chip tone="gap" glyph="○">{TRACE.notNemotron(s.notNemotron)}</Chip>
          ) : <span />}
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={onExpand} data-testid="trace-expand">{expanded ? TRACE.collapse : TRACE.expand}</Button>
            <a className="p-btn p-btn--ghost" href={apiUrl(`/runs/${encodeURIComponent(runId)}/trace`)} download={`trace-${runId}.jsonl`} data-testid="trace-jsonl" aria-label={TRACE.jsonl}>JSONL</a>
          </span>
        </div>
        <PillTabs small label="Trace filter" value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ id: f.id, label: f.label }))} />
      </div>
    </>
  );
}
