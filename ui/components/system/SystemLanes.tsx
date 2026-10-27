"use client";
import { systemView } from "@/lib/system-status";
import { SYSTEM } from "@/lib/copy-depth";
import { Chip } from "@/components/ui/chip";
import { useReady } from "@/components/shell/ReadyProvider";

/** The two pinned Nemotron lanes as /readyz reports them right now (asked vs answered model). */
export function SystemLanes() {
  const { ready, error } = useReady();
  const v = systemView(ready, error);
  return (
    <section className="grid gap-3" data-testid="system-lanes">
      <h2 className="t-heading text-fg">{SYSTEM.lanesTitle}</h2>
      <p className="t-ui-sm text-fg-2">{v.long}</p>
      {v.lanes.length ? (
        <div className="sy-lanes">
          {v.lanes.map((l) => (
            <div key={l.key} className="p-card sy-lane" data-testid="system-lane" data-lane={l.key}>
              <span className="t-eyebrow">{l.label}</span>
              <span className="t-mono-data text-fg t-wrap-any">{l.requested ?? "—"}</span>
              <span className="t-ui-xs text-fg-muted t-wrap-any">answered {l.answered ?? "not yet"}</span>
              <Chip tone={l.ok ? "agree" : "gap"} glyph={l.glyph}>{l.ok ? "Nemotron" : "Unconfirmed"}</Chip>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
