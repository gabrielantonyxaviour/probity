"use client";
import { X } from "lucide-react";
import type { GraphPayload } from "@schemas/graph";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { GRAPH } from "@/lib/copy";
import { ID_LABELS, FLAG_KEY_WORDS } from "@/lib/labels";
import { FLAG_TAGS, NODE_TYPE_WORDS } from "@/lib/labels-graph";
import { maskAccounts } from "@/lib/mask";
import { stamp } from "@/lib/format";

type PNode = GraphPayload["nodes"][number];
export type PopTarget = { x: number; y: number } & ({ kind: "node"; node: PNode; evidenceId: string | null; field: string | null } | { kind: "group"; label: string; body: string; queryId: string | null });

const KEYS: Record<string, string> = { uei: ID_LABELS.uei, cik: ID_LABELS.cik, vendor_id: ID_LABELS.vendor_id };

/** 280px node popover (01 section 9.6): type word, keys, flags as sentences, facts, Show evidence, Show in fact sheet. */
export function GraphPopover({ t, onClose, onEvidence, onFact, onQuery }: { t: PopTarget; onClose: () => void; onEvidence: (id: string) => void; onFact: (field: string) => void; onQuery: (id: string) => void }) {
  const style = { position: "absolute" as const, left: Math.max(8, t.x), top: Math.max(8, t.y), zIndex: 5, width: 280 };
  return (
    <div className="p-popover" style={style} role="dialog" aria-label="Node details" data-testid="graph-popover" data-overlay>
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-1 min-w-0">
          <span className="t-eyebrow">{t.kind === "node" ? NODE_TYPE_WORDS[t.node.type] : GRAPH.groupLabel(0).replace(/^\d+ /, "")}</span>
          <p className="t-ui text-fg t-wrap-any">{t.kind === "node" ? maskAccounts(t.node.label) : t.label}</p>
        </div>
        <IconButton label="Close" small onClick={onClose}><X /></IconButton>
      </div>
      {t.kind === "group" ? (
        <div className="grid gap-3 mt-3">
          <p className="t-ui-sm text-fg-2">{t.body}</p>
          {t.queryId ? <Button onClick={() => onQuery(t.queryId!)}>{GRAPH.showQuery}</Button> : null}
        </div>
      ) : (
        <div className="grid gap-3 mt-3">
          {t.node.sublabel ? <p className="t-ui-sm text-fg-muted">{t.node.sublabel}</p> : null}
          <dl className="p-dl">
            {Object.entries(t.node.keys).filter(([k]) => KEYS[k]).map(([k, v]) => <div key={k}><dt className="t-ui-xs">{KEYS[k]}</dt><dd className="t-mono-data">{v}</dd></div>)}
          </dl>
          {t.node.flags.filter((f) => f !== "real_registry").length ? (
            <div className="flex flex-wrap gap-1.5">{t.node.flags.filter((f) => f !== "real_registry").map((f) => <Chip key={f} tone={FLAG_TAGS[f].tone} glyph={FLAG_TAGS[f].tone === "agree" ? "✓" : "○"}>{FLAG_TAGS[f].tag}</Chip>)}</div>
          ) : null}
          {t.node.facts.map((f, i) => (
            <p key={i} className="t-ui-sm text-fg-2">
              {FLAG_KEY_WORDS[f.predicate] ?? f.predicate}: {typeof f.value === "object" && f.value ? FLAG_KEY_WORDS[(f.value as { status?: string }).status ?? ""] ?? "recorded" : String(f.value)}
              {f.session_id ? ` · session ${f.session_id}` : ""} · recorded by {t.node.provenance.by}, {stamp(t.node.provenance.at)}
            </p>
          ))}
          <div className="flex flex-wrap gap-2">
            {t.evidenceId ? <Button variant="ghost" onClick={() => onEvidence(t.evidenceId!)}>{GRAPH.showEvidence}</Button> : null}
            {t.field ? <Button variant="ghost" onClick={() => onFact(t.field!)}>{GRAPH.showInFacts}</Button> : null}
          </div>
        </div>
      )}
    </div>
  );
}
