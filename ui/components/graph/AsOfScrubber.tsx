"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { IconButton, Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ASOF } from "@/lib/copy-depth";
import { dayDate } from "@/lib/format";
import type { Tick } from "@/lib/graph-asof";

type Props = { ticks: Tick[]; index: number; onIndex: (i: number) => void; loading: boolean; counts: { nodes: number; edges: number } | null };

const when = (iso: string) => `${dayDate(iso)}, ${iso.slice(11, 19)} UTC`;
const kindLabel = (t: Tick) => (t.kind === "received" ? ASOF.received : t.kind === "decided" ? ASOF.decided : t.kind === "now" ? ASOF.now : ASOF.learned(t.added));

/** D5: scrub the entity graph from the request's received_at to now. Stops are event instants, evenly spaced. */
export function AsOfScrubber({ ticks, index, onIndex, loading, counts }: Props) {
  const [playing, setPlaying] = useState(false);
  const last = ticks.length - 1;
  useEffect(() => {
    if (!playing) return;
    if (index >= last) return setPlaying(false);
    const t = setTimeout(() => onIndex(index + 1), 900);
    return () => clearTimeout(t);
  }, [playing, index, last, onIndex]);
  if (ticks.length < 2) return null;
  const cur = ticks[Math.min(index, last)]!;
  const pct = (i: number) => (last === 0 ? 0 : (i / last) * 100);
  const play = () => {
    if (index >= last) onIndex(0);
    setPlaying((p) => !p);
  };
  return (
    <div className="asof" data-testid="graph-asof">
      <div className="asof__head">
        <span className="t-eyebrow">{ASOF.label}</span>
        <span className="asof__time" data-testid="graph-asof-time">{when(cur.at)}</span>
        <Chip tone={cur.kind === "decided" ? "conflict" : undefined}>{kindLabel(cur)}</Chip>
        {counts ? <span className="t-ui-xs text-fg-muted" aria-live="polite">{loading ? ASOF.loading : ASOF.counts(counts.nodes, counts.edges)}</span> : null}
        <span className="ml-auto flex items-center gap-1">
          <IconButton label={ASOF.prev} small onClick={() => { setPlaying(false); onIndex(Math.max(0, index - 1)); }} disabled={index <= 0}><ChevronLeft /></IconButton>
          <IconButton label={ASOF.next} small onClick={() => { setPlaying(false); onIndex(Math.min(last, index + 1)); }} disabled={index >= last}><ChevronRight /></IconButton>
          <Button variant="ghost" onClick={play} icon={playing ? <Pause /> : <Play />} data-testid="graph-asof-play">{playing ? ASOF.pause : ASOF.play}</Button>
        </span>
      </div>
      <div className="asof__track">
        <div className="asof__fill" style={{ width: `calc((100% - 14px) * ${pct(index) / 100})` }} aria-hidden />
        <div className="asof__ticks" aria-hidden>
          {ticks.map((t, i) => <span key={t.at} className="asof__tick" data-kind={t.kind} data-past={i <= index || undefined} style={{ left: `${pct(i)}%` }} />)}
        </div>
        <input
          className="asof__range"
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-label={ASOF.slider}
          aria-valuetext={`${kindLabel(cur)}, ${when(cur.at)}`}
          onChange={(e) => { setPlaying(false); onIndex(Number(e.target.value)); }}
          data-testid="graph-asof-range"
        />
      </div>
      <div className="asof__ends t-ui-xs text-fg-muted"><span>{ASOF.received} · {when(ticks[0]!.at)}</span><span>{ASOF.now}</span></div>
      <p className="t-ui-xs text-fg-muted">{ASOF.caption}</p>
    </div>
  );
}
