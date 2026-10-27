"use client";
import { useEffect, useState } from "react";
import { Expand } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Alert, Skeleton } from "@/components/ui/misc";
import { IconButton } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/tabs";
import { Eyebrow } from "@/components/ui/misc";
import { LETTER, NEW } from "@/lib/copy";
import { modelShort } from "@/lib/labels-trace";
import { claimedValue } from "@/lib/model/facts";
import { FACT_LABELS, FACT_ORDER } from "@/lib/labels";
import { hasLookalike } from "@/lib/model/reasons";
import { ClaimsList, PageImage, ZoomBar, domainOf, useEml, usePages } from "./LetterParts";
import { InjectionCard } from "./InjectionCard";
import { ReadingsCard } from "./ReadingsCard";
import { useReview } from "./review-context";

function ExtractionChip() {
  const { claims, state, decision } = useReview();
  if (!claims) return null;
  const ev = state.trace.find((e) => e.action === "extract_claims" && e.model);
  const model = modelShort(ev?.model ?? decision?.models_used.find((m) => m.agent === "letter_reader")?.model ?? "");
  const fn = LETTER.extraction[claims.extraction_path] as (m: string) => string;
  return <Chip tone="agree" glyph="✓" wrap testId="extraction-chip">{fn(model || "the model")}</Chip>;
}

function Headers() {
  const { decision, graph } = useReview();
  const { eml } = usePages(useReview().state.docPages);
  const { headers, error } = useEml(eml);
  if (error) return <Alert tone="conflict">{LETTER.imageError(0).replace("page 0", "the email headers")}</Alert>;
  if (!headers) return <div className="grid gap-3"><Skeleton w="80%" /><Skeleton w="60%" /></div>;
  const flags = graph.payload?.nodes.flatMap((n) => n.flags) ?? [];
  const row = decision?.fact_sheet.find((r) => r.field === "sender_domain");
  const look = decision ? hasLookalike(decision.reason_codes, flags) : false;
  const chip = (addr: string | null) => {
    if (!row || !addr) return null;
    if (row.status === "match") return <Chip tone="agree" glyph="✓">{LETTER.domain.onFile}</Chip>;
    return <Chip tone="conflict" glyph="✕">{look ? `${LETTER.domain.notOnFile} · ${LETTER.domain.lookalike}` : LETTER.domain.notOnFile}</Chip>;
  };
  const differs = headers.replyTo && domainOf(headers.replyTo) !== domainOf(headers.from);
  return (
    <dl className="p-dl" data-testid="eml-headers">
      {([["from", LETTER.headerFields.from], ["replyTo", LETTER.headerFields.replyTo], ["subject", LETTER.headerFields.subject], ["date", LETTER.headerFields.date]] as const).map(([k, label]) => (
        <div key={k}>
          <dt className="t-ui-sm">{label}</dt>
          <dd className="t-ui-sm grid justify-items-end gap-1"><span className="t-mono-data t-wrap-any">{headers[k] ?? "—"}</span>{k === "from" || k === "replyTo" ? chip(headers[k]) : null}{k === "replyTo" && differs ? <Chip tone="conflict" glyph="✕">{LETTER.replyToDiffers}</Chip> : null}</dd>
        </div>
      ))}
    </dl>
  );
}

function TypedCard() {
  const { claims } = useReview();
  return (
    <div className="p-card" style={{ padding: 16 }} data-testid="typed-card">
      <h3 className="t-eyebrow mb-2">{LETTER.typedCard}</h3>
      <dl className="p-dl">
        {FACT_ORDER.map((f) => {
          const v = claimedValue(f, claims);
          return v ? <div key={f}><dt className="t-ui-sm">{FACT_LABELS[f]}</dt><dd className="t-ui-sm">{v}</dd></div> : null;
        })}
      </dl>
      <p className="t-ui-xs text-fg-muted mt-3">{NEW.typedNotice}</p>
    </div>
  );
}

/** R-LETTER body (01 section 7.1.4): pages with highlight boxes, headers tab, claims list, extraction chip, footnotes. */
export function LetterBody({ zoomable = true, wideImage, split }: { zoomable?: boolean; wideImage?: boolean; split?: boolean }) {
  const { claims, state, setParams } = useReview();
  const { pages, eml } = usePages(state.docPages);
  const [tab, setTab] = useState("p1");
  const [zoom, setZoom] = useState(100);
  useEffect(() => setTab("p1"), [pages.length]);
  if (state.load === "loading" || (!claims && state.status === "running" && pages.length === 0)) {
    return (
      <div className="grid gap-3" data-testid="letter-pane" aria-busy="true">
        <div className="lt-frame dot-grid" style={{ aspectRatio: "8.5 / 11" }} />
        <Skeleton w="70%" />
      </div>
    );
  }
  if (claims?.extraction_path === "typed") return <div data-testid="letter-pane" className="grid gap-4"><TypedCard /><ExtractionChip /></div>;
  const tabs = [...pages.map((p, i) => ({ id: `p${i + 1}`, label: LETTER.pageTab(p.page) })), ...(eml ? [{ id: "eml", label: LETTER.headersTab }] : [])];
  const cur = pages[Number(tab.replace("p", "")) - 1] ?? pages[0];
  return (
    <div className={split ? "lt-split" : "grid gap-4"} data-testid="letter-pane">
      <div className="flex flex-wrap items-center justify-between gap-2" style={split ? { gridColumn: "1 / -1" } : undefined}>
        {tabs.length > 1 ? <PillTabs small label="Documents" items={tabs} value={tab} onChange={setTab} /> : <span />}
        <div className="flex items-center gap-2">
          {zoomable ? <ZoomBar zoom={zoom} setZoom={setZoom} /> : null}
          {zoomable ? <IconButton label={LETTER.expand} small onClick={() => setParams({ letter: "full" }, "push")}><Expand /></IconButton> : null}
        </div>
      </div>
      <div className="min-w-0" style={split ? { gridColumn: 1 } : undefined}><InjectionCard onShow={(n) => { setTab(`p${n}`); setTimeout(() => document.querySelector('[data-testid="injection-highlight"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 50); }} /></div>
      {tab === "eml" ? <Headers /> : cur && claims ? (
        <div style={{ overflow: "auto", maxWidth: wideImage ? 900 : undefined }}>
          <PageImage page={cur} claims={claims} zoom={zoom} />
        </div>
      ) : <Skeleton w="100%" h={24} />}
      {claims ? <ExtractionChip /> : null}
      <div className="min-w-0" style={split ? { gridColumn: 1 } : undefined}><ReadingsCard /></div>
      {claims && !split ? <ClaimsList claims={claims} /> : null}
      {claims && split ? <div style={{ gridColumn: 2, gridRow: "2 / span 3" }}><ClaimsList claims={claims} /></div> : null}
      <p className="t-ui-xs text-fg-muted" style={split ? { gridColumn: 1 } : undefined}>{LETTER.notInspected}</p>
    </div>
  );
}

export function LetterPane({ collapsed, onShow }: { collapsed: boolean; onShow: () => void }) {
  if (collapsed) {
    return (
      <div className="rv-letter" data-collapsed="true">
        <button type="button" onClick={onShow} className="rv-letter-strip" aria-label={LETTER.showLetter} data-testid="show-letter">{LETTER.showLetter}</button>
      </div>
    );
  }
  return (
    <div className="rv-letter">
      <div className="region-head" style={{ marginBottom: 0 }}><Eyebrow>{LETTER.heading}</Eyebrow></div>
      <LetterBody />
    </div>
  );
}
