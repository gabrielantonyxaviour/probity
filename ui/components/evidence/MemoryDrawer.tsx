"use client";
import { Sheet } from "@/components/ui/overlay";
import { DlRow } from "@/components/ui/misc";
import { EVIDENCE } from "@/lib/copy";
import { FLAG_KEY_WORDS } from "@/lib/labels";
import { maskAccounts } from "@/lib/mask";
import { stamp } from "@/lib/format";
import { useReview } from "@/components/review/review-context";

/** Memory drawer ?memory= : the recalled fact or note with provenance and its session (01 section 7.3). */
export function MemoryDrawer() {
  const r = useReview();
  const id = r.param("memory");
  const mem = r.decision?.memory_recalled.find((m) => m.memory_id === id) ?? null;
  const facts = (r.graph.payload?.nodes ?? []).flatMap((n) => n.facts.map((f) => ({ n, f }))).filter(({ f }) => f.predicate === "fraud_flag" && (!mem || f.session_id === mem.session_id));
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && r.setParams({ memory: null })} eyebrow="Memory" title={mem ? EVIDENCE.memoryTitle(mem.session_id) : EVIDENCE.memoryNotFound} testId="memory-drawer">
      {mem ? (
        <>
          <div className="p-sheet__cell grid gap-3">
            <p className="t-mono-panel text-fg-muted" style={{ fontSize: 12 }}>{EVIDENCE.memoryHead(mem.session_id)}</p>
            <dl className="p-dl">
              <DlRow label="Engine">{mem.engine === "world_model" ? "World Model" : "H-MEM"}</DlRow>
              <DlRow label="Session"><span className="t-mono-data">{mem.session_id}</span></DlRow>
              <DlRow label="What was remembered">{maskAccounts(mem.text)}</DlRow>
              <DlRow label="Effect on this check">{mem.effect}</DlRow>
            </dl>
          </div>
          {facts.length ? (
            <div className="p-sheet__cell grid gap-2">
              <span className="t-eyebrow">Recorded facts</span>
              <dl className="p-dl">
                {facts.map(({ n, f }, i) => {
                  const v = typeof f.value === "object" && f.value ? (f.value as { status?: string }).status : String(f.value);
                  return <DlRow key={i} label={`${n.label} · ${FLAG_KEY_WORDS[f.predicate] ?? f.predicate}`}>{FLAG_KEY_WORDS[v ?? ""] ?? v}<br /><span className="t-ui-xs text-fg-muted">{n.provenance.by} · {stamp(n.provenance.at)}{n.provenance.run_id ? ` · run ${n.provenance.run_id}` : ""}</span></DlRow>;
                })}
              </dl>
            </div>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
