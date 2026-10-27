"use client";
import { systemView } from "@/lib/system-status";
import { SHELL } from "@/lib/copy";
import { Chip } from "@/components/ui/chip";
import { Popover } from "@/components/ui/overlay";
import { modelShort } from "@/lib/labels-trace";
import { useReady } from "./ReadyProvider";
import { useShellState } from "./shell-state";

/** Header chip + 280px popover (lanes, requested vs answered model). `streaming` pulses the dot while a check runs. */
export function SystemChip() {
  const { ready, error } = useReady();
  const { streaming } = useShellState();
  const v = systemView(ready, error);
  const glyph = v.tone === "agree" ? "●" : v.tone === "info" ? "i" : v.tone === "neutral" ? "…" : "●";
  return (
    <Popover
      label={SHELL.popoverTitle}
      trigger={
        <button type="button" data-testid="system-chip" className="inline-flex" aria-label={`${SHELL.popoverTitle}: ${v.long}`}>
          <Chip tone={v.tone} glyph={glyph} running={streaming && v.tone === "agree"}>
            <span className="sys-long">{v.long}</span>
            <span className="sys-mid">{v.mid}</span>
            <span className="sys-short">{v.short}</span>
          </Chip>
        </button>
      }
    >
      <div className="grid gap-3">
        <span className="t-eyebrow">{SHELL.popoverTitle}</span>
        <p className="t-ui-sm text-fg">{v.long}</p>
        {v.mode !== "sample" && v.lanes.length > 0 ? (
          <div className="sys-rows t-ui-xs">
            {v.lanes.map((l) => (
              <div key={l.key}>
                <span className="t-mono-label text-fg-muted">{l.label}</span>
                <span className="text-fg-2 t-wrap-any">
                  <span className="text-fg-muted">asked </span>
                  {l.requested ? modelShort(l.requested) : "—"}
                  <br />
                  <span className="text-fg-muted">answered </span>
                  {l.answered ? modelShort(l.answered) : "not yet"}
                </span>
                <Chip tone={l.ok ? "agree" : "gap"} glyph={l.glyph}>{l.ok ? "Nemotron" : "Unconfirmed"}</Chip>
              </div>
            ))}
          </div>
        ) : null}
        {v.mode !== "sample" ? <p className="t-ui-xs text-fg-muted">{SHELL.visionUnavailable}</p> : null}
        {v.entities != null ? <p className="t-ui-xs text-fg-muted">World Model: {v.entities} entities</p> : null}
        {error ? <p className="t-ui-xs text-conflict-text">{error.message}</p> : null}
      </div>
    </Popover>
  );
}
