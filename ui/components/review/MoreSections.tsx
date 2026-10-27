"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, Chip } from "@/components/ui/chip";
import { MORE } from "@/lib/copy";
import { useReview } from "./review-context";

function Section({ title, aside, children, defaultOpen = false }: { title: string; aside?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-rule first:border-t-0">
      <button type="button" className="why-toggle w-full t-ui" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ padding: "16px 0" }}>
        <span className="flex items-center gap-3"><span style={{ fontSize: 16, lineHeight: "24px" }}>{title}</span>{aside}</span>
        <ChevronDown size={16} style={{ rotate: open ? "180deg" : "0deg", transition: "rotate var(--dur-4) ease" }} aria-hidden />
      </button>
      <div className="why-more" data-open={open}><div><div className="pb-4">{children}</div></div></div>
    </div>
  );
}

/** R-MORE: conflicts, suggested edits, registry data gaps, limitations (01 section 7.1.7). All from the GateDecision. */
export function MoreSections() {
  const { decision } = useReview();
  if (!decision) return null;
  const gaps = decision.reason_codes.filter((c) => c.code === "I5");
  return (
    <section data-testid="more-sections">
      {decision.conflicts.length > 0 ? (
        <Section title={MORE.conflicts(decision.conflicts.length)} defaultOpen>
          <ul>
            {decision.conflicts.map((c) => (
              <li key={c.conflict_id} className="why-row">
                <span className="why-box" style={{ color: "var(--conflict-text)" }} aria-hidden>{c.resolution === "unresolved" ? "✕" : "⇄"}</span>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="t-ui text-fg min-w-0" style={{ flex: "1 1 260px" }}>{c.description}</p>
                  <Chip prov={c.resolution === "unresolved"} tone={c.resolution === "unresolved" ? "conflict" : "agree"} glyph={c.resolution === "unresolved" ? "✕" : "✓"}>
                    {c.resolution === "unresolved" ? MORE.resolved.unresolved : MORE.resolved[c.by]}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {decision.suggested_edits.length > 0 ? (
        <Section title={MORE.edits} aside={<Badge small>{MORE.proposed}</Badge>}>
          <div className="ledger-wrap" tabIndex={0} role="region" aria-label="Table">
            <table className="ledger">
              <thead><tr>{MORE.editCols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>
                {decision.suggested_edits.map((e) => (
                  <tr key={`${e.vendor_id}${e.field}`} data-testid="suggested-edit">
                    <td className="t-mono-data">{e.vendor_id}</td><td>{e.field}</td><td>{e.current ?? "—"}</td><td>{e.suggested}</td>
                    <td className="t-mono-data">{e.evidence_ids.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-ui-xs text-fg-muted mt-2">{MORE.editsNote}</p>
        </Section>
      ) : null}
      {gaps.length > 0 ? (
        <Section title={MORE.gaps}><ul className="grid gap-2">{gaps.map((g) => <li key={g.detail} className="t-ui-sm text-fg-2">{g.detail}</li>)}</ul></Section>
      ) : null}
      {decision.limitations.length > 0 ? (
        <Section title={MORE.limits}><ul className="grid gap-2">{decision.limitations.map((l) => <li key={l} className="t-ui-sm text-fg-2">{l}</li>)}</ul></Section>
      ) : null}
    </section>
  );
}
