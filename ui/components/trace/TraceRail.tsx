"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TraceEvent } from "@/lib/contracts";
import { PulseDot } from "@/components/ui/misc";
import { TRACE, REVIEW } from "@/lib/copy";
import { mmss } from "@/lib/format";
import type { TraceFilter } from "@/lib/labels-trace";
import { buildTraceItems, eventAnchor, type TraceItem } from "@/lib/model/trace";
import { useNow } from "@/lib/hooks/use-now";
import { useReview } from "@/components/review/review-context";
import { Monogram } from "./TraceChips";
import { SummaryBar } from "./SummaryBar";
import { TraceRow } from "./TraceRow";
import type { AgentName } from "@schemas/trace";

function GroupRow({ item, startMs, fresh }: { item: Extract<TraceItem, { kind: "group" }>; startMs: number; fresh: (seq: number) => boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tr-group" data-testid="timeline-group">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="tr-ev__t t-mono-label">{item.evs[0] ? `+${Math.max(0, Math.round((Date.parse(item.evs[0].timestamp) - startMs) / 1000))}s` : ""}</span>
        <Monogram agent="evidence_runner" />
        <span className="t-ui-sm text-fg">{TRACE.group(item.evs.length, item.rows, item.labels.join(", "))}</span>
        <ChevronDown size={16} aria-hidden style={{ rotate: open ? "180deg" : "0deg", transition: "rotate var(--dur-4) ease" }} />
      </button>
      <div className="tr-group__body" data-open={open}>
        <div>{open ? item.evs.map((e) => <TraceRow key={e.seq} ev={e} startMs={startMs} challenge={null} fresh={fresh(e.seq)} />) : null}</div>
      </div>
    </div>
  );
}

/** R-TRACE (01 section 8): role=log rail. Rows are keyed by seq; reload and replay never duplicate. */
export function TraceRail({ filterOverride, full }: { filterOverride?: TraceFilter; full?: boolean }) {
  const { state, runId, running, setParams, param } = useReview();
  const [filter, setFilter] = useState<TraceFilter>("agents");
  const [agentFilter, setAgentFilter] = useState<AgentName | null>(null);
  const eff = filterOverride ?? filter;
  const scroller = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const initialMax = useRef<number | null>(null);
  const trace: TraceEvent[] = state.trace;
  if (initialMax.current == null && state.traceLoaded) initialMax.current = trace.length ? trace[trace.length - 1].seq : 0;
  const startMs = state.startedAt ? Date.parse(state.startedAt) : trace[0] ? Date.parse(trace[0].timestamp) : Date.now();
  const items = useMemo(() => {
    const base = buildTraceItems(trace, eff);
    if (!agentFilter) return base;
    return base.filter((i) => i.kind === "round" || (i.kind === "event" ? i.ev.agent_name === agentFilter || i.ev.target_agent === agentFilter : i.evs.some((e) => e.agent_name === agentFilter)));
  }, [trace, eff, agentFilter]);
  const fresh = (seq: number) => initialMax.current != null && seq > initialMax.current;
  const lastSeq = trace.length ? trace[trace.length - 1].seq : 0;
  const prevSeq = useRef(lastSeq);

  useEffect(() => {
    const el = scroller.current?.closest<HTMLElement>("[data-trace-scroll]") ?? scroller.current;
    if (!el) return;
    const onScroll = () => setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (lastSeq === prevSeq.current) return;
    const added = lastSeq - prevSeq.current;
    prevSeq.current = lastSeq;
    const el = scroller.current?.closest<HTMLElement>("[data-trace-scroll]") ?? scroller.current;
    if (!el || !running) return;
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    else setUnseen((u) => u + Math.max(1, added));
  }, [lastSeq, running, atBottom]);
  useEffect(() => { if (atBottom) setUnseen(0); }, [atBottom]);

  const last = trace[trace.length - 1];
  const now = useNow(running);
  const waited = last ? Math.max(0, Math.round((now - Date.parse(last.timestamp)) / 1000)) : 0;
  const beamRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    const beam = beamRef.current;
    if (!list || !beam) return;
    const lastEl = list.querySelector<HTMLElement>(`#${eventAnchor(lastSeq)}`);
    beam.style.height = `${lastEl ? lastEl.offsetTop + 28 : 0}px`;
  }, [lastSeq, items.length]);

  return (
    <div className="tr" data-testid="trace-rail" ref={scroller}>
      <SummaryBar trace={trace} filter={eff} setFilter={setFilter} expanded={!!full} onExpand={() => setParams({ trace: param("trace") === "full" ? null : "full" })} runId={runId} agentFilter={agentFilter} setAgentFilter={setAgentFilter} />
      <div className="tr__list" ref={listRef}>
        <div className="tr__beam" ref={beamRef} data-off={running ? undefined : "true"} aria-hidden />
        <div role="log" aria-live="off" aria-label={TRACE.heading} data-testid="timeline">
          {!state.traceLoaded ? <p className="tr-empty t-ui-sm text-fg-muted" data-testid="loading">{TRACE.loading}</p> : null}
          {state.traceLoaded && items.length === 0 ? <p className="tr-empty t-ui-sm text-fg-muted">{TRACE.noEvents}</p> : null}
          {items.map((it) => {
            if (it.kind === "round") {
              return (
                <div key={it.key} id={`trace-round-${it.round}`} className="tr-round" data-testid="round-header" data-round={it.round}>
                  <span className="t-eyebrow t-wrap-any">{it.title}</span>
                  {it.challengeSeq ? <a href={`#${eventAnchor(it.challengeSeq)}`} className="tr-round__ref t-mono-label p-link" onClick={(e) => { e.preventDefault(); document.getElementById(eventAnchor(it.challengeSeq!))?.scrollIntoView({ block: "center" }); }}>{TRACE.respondsTo.toUpperCase()}</a> : null}
                </div>
              );
            }
            if (it.kind === "group") return <GroupRow key={it.key} item={it} startMs={startMs} fresh={fresh} />;
            return <TraceRow key={it.key} ev={it.ev} startMs={startMs} challenge={it.challenge} fresh={fresh(it.ev.seq)} />;
          })}
        </div>
        {running ? (
          <p className="tr-wait t-mono-label" data-testid="trace-waiting"><PulseDot />{REVIEW.waiting(mmss(waited)).toUpperCase()}</p>
        ) : null}
        {unseen > 0 ? (
          <div className="tr-pill">
            <button type="button" className="p-chip" onClick={() => { const el = scroller.current?.closest<HTMLElement>("[data-trace-scroll]"); el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }}>{TRACE.newEvents(unseen)}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
