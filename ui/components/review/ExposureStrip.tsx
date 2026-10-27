"use client";
import { Skeleton } from "@/components/ui/misc";
import { EXPO } from "@/lib/copy";
import { money, plural, runDate } from "@/lib/format";
import { uniqueItems } from "@/lib/model/sweep";
import { useReview } from "./review-context";

function Cell({ label, value, tone, href, testId, grow }: { label?: string; value: string; tone?: "conflict" | "gap"; href?: string; testId?: string; grow?: number }) {
  const color = tone === "conflict" ? "var(--conflict-text)" : tone === "gap" ? "var(--gap)" : "var(--fg)";
  const inner = (
    <>
      {tone === "conflict" ? <span className="p-dot p-dot--sm" style={{ color: "var(--conflict)" }} aria-hidden /> : null}
      <span className="rv-expo__v">
        {label ? <span className="t-mono-label text-fg-muted">{label}</span> : null}
        {label ? " " : null}
        <span className="t-mono-data" style={{ color }}>{value}</span>
      </span>
    </>
  );
  const style = grow ? { flexGrow: grow } : undefined;
  return href ? (
    <a href={href} className="rv-expo__cell p-link" data-testid={testId} style={style}>{inner}</a>
  ) : (
    <div className="rv-expo__cell" data-testid={testId} style={style}>{inner}</div>
  );
}

/** Exposure strip (01 section 7.1.1): payload values only, no client sums (UI law 1). */
export function ExposureStrip() {
  const { state, decision } = useReview();
  const e = decision?.exposure ?? state.exposure;
  if (!e) {
    return (
      <div className="rv-expo" data-testid="exposure-strip" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rv-expo__cell"><Skeleton w="60%" h={12} /></div>
        ))}
      </div>
    );
  }
  const items = plural(e.vendor_item_count, "item");
  const [vLabel, vValue] =
    e.scope === "none" ? EXPO.noVendor : e.scope === "candidates" ? [EXPO.candidates[0], EXPO.candidates[1](items, money(e.vendor_amount_usd))] : [EXPO.vendor[0], EXPO.vendor[1](items, money(e.vendor_amount_usd))];
  // Count payments, not rule hits: one item can fail DQ1 and DQ2 and must count once.
  const findings = uniqueItems(decision?.sweep.findings ?? []);
  return (
    <div className="rv-expo" data-testid="exposure-strip">
      <Cell grow={1.5} value={EXPO.run(e.payment_run_id, runDate(e.scheduled_date), e.cutoff_local)} />
      <Cell label={vLabel} value={vValue as string} />
      <Cell label={EXPO.wholeRun[0]} value={EXPO.wholeRun[1](plural(e.run_item_count, "item"), money(e.run_amount_usd))} />
      {decision?.decision === "HOLD" && e.scope !== "none" ? <Cell tone="conflict" label={EXPO.hold[0]} value={EXPO.hold[1](plural(e.vendor_item_count, "item"))} testId="expo-hold" /> : null}
      {decision && findings > 0 ? <Cell tone="gap" href="#sweep" label={EXPO.sweep[0]} value={EXPO.sweep[1](plural(findings, "item"), money(decision.sweep.amount_usd))} testId="expo-sweep" /> : null}
    </div>
  );
}
