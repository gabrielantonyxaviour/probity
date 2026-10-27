"use client";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { ClaimSet, DocPage } from "@/lib/contracts";
import { Chip } from "@/components/ui/chip";
import { Button, IconButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { apiText, fileUrl } from "@/lib/api";
import { LETTER } from "@/lib/copy";
import { PRESSURE_KINDS } from "@/lib/labels";
import { maskAccounts } from "@/lib/mask";
import { injectionOf, pageSpans } from "@/lib/model/depth";
import { InjectionBoxes } from "./InjectionCard";
import { useReview } from "./review-context";

type Field = ClaimSet["fields"][number];

export function fieldName(f: Field["field"]): string {
  return LETTER.fieldNames[f] ?? f;
}

const BOX_SKIP = new Set(["watermark"]);

/** One letter page with numbered highlight boxes (bbox_hint / 1000) and cross-highlighting (01 section 7.1.4). */
export function PageImage({ page, claims, zoom }: { page: DocPage; claims: ClaimSet; zoom: number }) {
  const { hl, setHl, decision } = useReview();
  const spans = pageSpans(injectionOf(decision), page.page);
  const [failed, setFailed] = useState(0);
  const [src, setSrc] = useState(fileUrl(page.url));
  useEffect(() => setSrc(fileUrl(page.url)), [page.url]);
  const boxes = claims.fields
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.page === page.page && f.bbox_hint && !BOX_SKIP.has(f.field));
  if (failed > 0 && failed < 100) {
    return (
      <Alert tone="conflict" actions={<Button onClick={() => { setSrc(`${fileUrl(page.url)}?retry=${Date.now()}`); setFailed(0); }}>Retry</Button>}>{LETTER.imageError(page.page)}</Alert>
    );
  }
  return (
    <div className="lt-frame">
      <div className="lt-page" style={{ width: `${zoom}%`, aspectRatio: `${page.width} / ${page.height}` }} data-testid="letter-page">
        <img src={src} alt={`Letter page ${page.page}`} width={page.width} height={page.height} onError={() => setFailed(1)} draggable={false} />
        <InjectionBoxes spans={spans} />
        {boxes.map(({ f, i }) => {
          const [x0, y0, x1, y1] = f.bbox_hint!;
          const active = hl.claim === i || (hl.field != null && hl.field === f.fact_field);
          return (
            <button
              key={i}
              type="button"
              className="lt-box"
              data-testid="letter-highlight"
              data-field={f.fact_field ?? f.field}
              data-kind={f.field === "pressure_phrase" ? "pressure" : "claim"}
              data-hl={active || undefined}
              aria-label={`${i + 1}. ${fieldName(f.field)}`}
              style={{ left: `${x0 / 10}%`, top: `${y0 / 10}%`, width: `${(x1 - x0) / 10}%`, height: `${(y1 - y0) / 10}%` }}
              onMouseEnter={() => setHl({ field: f.fact_field, claim: i })}
              onMouseLeave={() => setHl({ field: null, claim: null })}
              onFocus={() => setHl({ field: f.fact_field, claim: i })}
              onBlur={() => setHl({ field: null, claim: null })}
            >
              <span className="lt-n">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ZoomBar({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <IconButton label={LETTER.zoomOut} small onClick={() => setZoom(Math.max(100, zoom - 25))}><Minus /></IconButton>
      <IconButton label={LETTER.zoomIn} small onClick={() => setZoom(Math.min(250, zoom + 25))}><Plus /></IconButton>
      <IconButton label={LETTER.fit} small onClick={() => setZoom(100)}><Maximize2 /></IconButton>
    </div>
  );
}

export function ClaimsList({ claims }: { claims: ClaimSet }) {
  const { hl, setHl } = useReview();
  const items = claims.fields.map((f, i) => ({ f, i })).filter(({ f }) => !BOX_SKIP.has(f.field));
  const anyBoxes = claims.fields.some((f) => f.bbox_hint);
  return (
    <div className="grid gap-2">
      <h3 className="t-eyebrow">{LETTER.claims}</h3>
      {!anyBoxes && items.length > 0 ? <p className="t-ui-xs text-fg-muted">{LETTER.noBoxes}</p> : null}
      <ol className="lt-claims" data-testid="claims-list">
        {items.map(({ f, i }) => {
          const pressure = f.field === "pressure_phrase" ? claims.pressure_phrases.find((p) => p.quote === f.quote) : null;
          return (
            <li key={i} className="lt-claim" data-hl={hl.claim === i || (hl.field != null && hl.field === f.fact_field) || undefined} onMouseEnter={() => setHl({ field: f.fact_field, claim: i })} onMouseLeave={() => setHl({ field: null, claim: null })}>
              <span className="lt-claim__n t-mono-data">{String(i + 1).padStart(2, "0")}</span>
              <div className="grid gap-1 min-w-0">
                <p className="t-ui-sm text-fg">{fieldName(f.field)}{f.page > 1 ? <span className="text-fg-muted"> · page {f.page}</span> : null}</p>
                <p className="t-ui-sm lt-quote t-wrap-any">“{maskAccounts(f.quote)}”</p>
                {pressure ? (
                  <span className="flex flex-wrap gap-1.5">
                    {pressure.kind === "embedded_instruction" ? <Chip tone="conflict" glyph="✕">{PRESSURE_KINDS.embedded_instruction}</Chip> : <Chip tone="gap" glyph="○">{LETTER.pressure}</Chip>}
                    {pressure.kind !== "embedded_instruction" ? <Chip>{PRESSURE_KINDS[pressure.kind]}</Chip> : null}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type EmlHeaders = { from: string | null; replyTo: string | null; subject: string | null; date: string | null };

export function parseEml(text: string): EmlHeaders {
  const head = text.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
  const get = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, "im").exec(head)?.[1]?.trim() ?? null;
  return { from: get("From"), replyTo: get("Reply-To"), subject: get("Subject"), date: get("Date") };
}

export function useEml(doc: DocPage | undefined): { headers: EmlHeaders | null; error: boolean } {
  const [state, setState] = useState<{ headers: EmlHeaders | null; error: boolean }>({ headers: null, error: false });
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    apiText(doc.url).then((t) => alive && setState({ headers: parseEml(t), error: false })).catch(() => alive && setState({ headers: null, error: true }));
    return () => {
      alive = false;
    };
  }, [doc]);
  return state;
}

export const domainOf = (addr: string | null) => (addr ? (/@([^>\s]+)/.exec(addr)?.[1] ?? addr).toLowerCase() : null);

export function usePages(docPages: DocPage[]) {
  return useMemo(() => ({ pages: docPages.filter((d) => d.kind !== "eml_headers"), eml: docPages.find((d) => d.kind === "eml_headers") }), [docPages]);
}
