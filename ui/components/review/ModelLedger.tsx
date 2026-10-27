"use client";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { MODELS } from "@/lib/copy";
import { int, latency } from "@/lib/format";
import { LANE_LABELS, modelShort } from "@/lib/labels-trace";
import { agentName, buildLedger } from "@/lib/model/nemotron";
import { useReview } from "./review-context";

/** Model ledger (01 section 7.1.6): from trace events while streaming, from models_used[] after the decision. */
export function ModelLedger({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { state, decision, sample } = useReview();
  const [open, setOpen] = useState(defaultOpen);
  const rows = useMemo(() => buildLedger({ decision, trace: state.trace }), [decision, state.trace]);
  const cost = decision?.cost;
  return (
    <div className="grid gap-3">
      <button type="button" className="why-toggle t-ui-sm w-full" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="t-eyebrow">{MODELS.ledger}</span>
        <ChevronDown size={16} style={{ rotate: open ? "180deg" : "0deg", transition: "rotate var(--dur-4) ease" }} aria-hidden />
      </button>
      {open ? (
        <>
          <div className="ledger-wrap" tabIndex={0} role="region" aria-label="Table">
            <table className="ledger" data-testid="model-ledger">
              <thead><tr>{MODELS.ledgerCols.map((c, i) => <th key={c} scope="col" className={i >= 4 && i <= 7 ? "num" : undefined}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={9} className="text-fg-muted">{sample ? MODELS.sampleNotRun : MODELS.notNeeded}</td></tr> : null}
                {rows.map((m) => (
                  <tr key={`${m.agent}${m.lane}${m.model}`} data-testid="model-row" data-lane={m.lane} data-nemotron={String(m.nemotron)}>
                    <td>{agentName(m.agent)}</td>
                    <td>{LANE_LABELS[m.lane as keyof typeof LANE_LABELS] ?? m.lane}</td>
                    <td className="t-mono-data">{modelShort(m.requested)}</td>
                    <td className="t-mono-data">{sample ? MODELS.sampleModel : modelShort(m.model)}</td>
                    <td className="num">{m.calls}</td>
                    <td className="num">{m.tokensIn == null ? <i className="text-fg-muted">{MODELS.notReported}</i> : int(m.tokensIn)}</td>
                    <td className="num">{m.tokensOut == null ? <i className="text-fg-muted">{MODELS.notReported}</i> : int(m.tokensOut)}</td>
                    <td className="num">{latency(m.p50)}</td>
                    <td>{m.nemotron ? <Chip tone="agree" glyph="✓">{MODELS.nemotron}</Chip> : <Chip tone="gap" glyph="✕">{MODELS.notNemotron}</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cost ? <p className="t-mono-label text-fg-muted">{MODELS.cost(cost.deep_calls, cost.fast_calls, cost.tokens_total == null ? MODELS.tokensNotReported : MODELS.tokens(int(cost.tokens_total)))}</p> : null}
        </>
      ) : null}
    </div>
  );
}
