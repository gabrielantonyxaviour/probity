"use client";
import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { PillTabs, Segmented } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useBreakpoint } from "@/lib/hooks/use-breakpoint";
import { LETTER, REVIEW } from "@/lib/copy";
import { GraphPanel } from "@/components/graph/GraphPanel";
import { TraceRail } from "@/components/trace/TraceRail";
import { Banners } from "./Banners";
import { DecisionSlot } from "./DecisionSlot";
import { ExposureStrip } from "./ExposureStrip";
import { FactSheet } from "./FactSheet";
import { LetterBody, LetterPane } from "./LetterPane";
import { ModelsFooter } from "./ModelsFooter";
import { MoreSections } from "./MoreSections";
import { ReviewHead } from "./ReviewHead";
import { SweepAlert } from "./SweepAlert";
import { useReview } from "./review-context";
import { summarize } from "@/lib/model/trace";

type Tab = "facts" | "graph" | "trace" | "models";
type NarrowTab = Tab | "letter";

function Top() {
  return (
    <>
      <ReviewHead />
      <ExposureStrip />
      <Banners />
    </>
  );
}

function FactsPanel() {
  return (
    <>
      <div className="rv-panel"><FactSheet /></div>
      <div className="rv-panel"><MoreSections /></div>
    </>
  );
}

function Wide({ traceFull }: { traceFull: boolean }) {
  const r = useReview();
  const [letterOpen, setLetterOpen] = useState(false);
  const collapsed = r.decided && !letterOpen;
  if (traceFull) {
    return (
      <div className="rv-cols" data-trace-full="true">
        <div className="tr-full-wrap" data-trace-scroll style={{ minHeight: "60dvh" }}><TraceRail full /><ModelsFooter /></div>
      </div>
    );
  }
  return (
    <div className="rv-cols" data-collapsed={collapsed} data-testid="review-columns">
      <aside className="rv-rail" aria-label={LETTER.heading}>
        <LetterPane collapsed={collapsed} onShow={() => setLetterOpen(true)} />
      </aside>
      <div className="rv-centre">
        <DecisionSlot />
        <SweepAlert />
        <section><FactSheet /></section>
        <section><GraphPanel /></section>
        <MoreSections />
      </div>
      <aside className="rv-rail rv-rail--trace" data-trace-scroll aria-label="Agent trace">
        <TraceRail />
        <ModelsFooter />
      </aside>
    </div>
  );
}

function Medium({ traceFull }: { traceFull: boolean }) {
  const r = useReview();
  const [tab, setTab] = useState<Tab>("facts");
  const [letterOpen, setLetterOpen] = useState(true);
  const count = summarize(r.state.trace);
  const graphFull = r.param("graph") === "full";
  useEffect(() => { if (traceFull) setTab("trace"); }, [traceFull]);
  // A ?graph=full deep link (landing page, dossier) must land on the graph, not on the Facts tab.
  useEffect(() => { if (graphFull) setTab("graph"); }, [graphFull]);
  return (
    <>
      <DecisionSlot />
      <SweepAlert />
      <div className="rv-split" data-collapsed={!letterOpen}>
        <aside className="rv-letter-col rv-rail" style={{ position: "static", height: "auto" }}>
          {letterOpen ? (
            <div className="rv-letter">
              <div className="flex items-center justify-between"><span className="t-eyebrow">{LETTER.heading}</span><Button variant="ghost" onClick={() => setLetterOpen(false)}>{LETTER.hideLetter}</Button></div>
              <LetterBody />
            </div>
          ) : (
            <LetterPane collapsed onShow={() => setLetterOpen(true)} />
          )}
        </aside>
        <div className="min-w-0">
          <div className="rv-tabs-bar">
            <PillTabs
              label="Review panels"
              value={tab}
              onChange={setTab}
              items={[
                { id: "facts", label: "Facts" },
                { id: "graph", label: "Graph" },
                { id: "trace", label: "Agent trace", count: r.running ? <Chip running>{count.handoffs + r.state.trace.length}</Chip> : r.state.trace.length },
                { id: "models", label: "Models" },
              ]}
            />
          </div>
          {tab === "facts" ? <FactsPanel /> : null}
          {tab === "graph" ? <div className="rv-panel"><GraphPanel /></div> : null}
          {tab === "trace" ? <div data-trace-scroll={undefined}><TraceRail full={traceFull} /></div> : null}
          {tab === "models" ? <ModelsFooter /> : null}
        </div>
      </div>
    </>
  );
}

function Narrow() {
  const r = useReview();
  const [tab, setTab] = useState<NarrowTab>("facts");
  const graphFull = r.param("graph") === "full";
  useEffect(() => { if (graphFull) setTab("graph"); }, [graphFull]);
  return (
    <>
      <DecisionSlot />
      <SweepAlert />
      <div className="rv-seg-bar">
        <Segmented tabs full large label="Review panels" value={tab} onChange={setTab} items={[
          { id: "facts", label: "Facts" }, { id: "letter", label: "Letter" }, { id: "graph", label: "Graph" }, { id: "trace", label: `Trace ${r.state.trace.length}` }, { id: "models", label: "Models" },
        ]} />
      </div>
      {tab === "facts" ? <FactsPanel /> : null}
      {tab === "letter" ? <div className="rv-panel"><LetterBody /></div> : null}
      {tab === "graph" ? <div className="rv-panel"><GraphPanel /></div> : null}
      {tab === "trace" ? <TraceRail /> : null}
      {tab === "models" ? <ModelsFooter /> : null}
    </>
  );
}

export function ReviewLayout() {
  const r = useReview();
  const bp = useBreakpoint();
  const traceFull = r.param("trace") === "full";
  return (
    <div data-testid="review-page" data-width={bp}>
      <Top />
      {traceFull ? (
        <div className="p-banner" style={{ background: "transparent", borderBottom: "var(--line)" }}>
          <Button variant="ghost" onClick={() => r.setParams({ trace: null })}>{REVIEW.crumb}: close full trace</Button>
        </div>
      ) : null}
      {bp === "wide" ? <Wide traceFull={traceFull} /> : bp === "medium" ? <Medium traceFull={traceFull} /> : <Narrow />}
    </div>
  );
}
