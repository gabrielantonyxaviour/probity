import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

/** Mono eyebrow. With `wipe` it reveals with a clip-path on mount only. */
export function Eyebrow({ children, n, wipe, className }: { children: ReactNode; n?: string; wipe?: boolean; className?: string }) {
  return (
    <span className={cn("t-eyebrow", wipe && "eyebrow-wipe", className)}>
      {n ? <span className="p-eyebrow-n">{n}</span> : null}
      {children}
    </span>
  );
}

export function PulseDot({ className }: { className?: string }) {
  return <span className={cn("p-dot p-dot--sm p-pulse", className)} aria-hidden />;
}

/** Two-tone sentence: the fact in --fg, the context in --fg-muted. */
export function TwoTone({ fact, context, className }: { fact: ReactNode; context?: ReactNode; className?: string }) {
  return (
    <span className={className}>
      <span className="text-fg">{fact}</span>
      {context ? <> <span className="text-fg-muted">{context}</span></> : null}
    </span>
  );
}

const ALERT_GLYPH: Record<Tone, string> = { agree: "✓", gap: "○", conflict: "✕", info: "i", neutral: "i" };

export function Alert({ tone = "neutral", glyph, children, naked, role, className, testId, actions }: { tone?: Tone; glyph?: string; children: ReactNode; naked?: boolean; role?: string; className?: string; testId?: string; actions?: ReactNode }) {
  return (
    <div className={cn("p-alert t-ui-sm", naked && "p-alert--naked", className)} data-tone={tone === "neutral" ? undefined : tone} role={role} data-testid={testId}>
      <span className="p-alert__g" aria-hidden>{glyph ?? ALERT_GLYPH[tone]}</span>
      <div className="p-alert__body">{children}</div>
      {actions}
    </div>
  );
}

export function Banner({ tone = "info", tag, children, testId }: { tone?: "info" | "gap" | "conflict"; tag: string; children: ReactNode; testId?: string }) {
  return (
    <div className="p-banner" data-tone={tone} data-testid={testId}>
      <span className="p-banner__tag t-mono-label">{tag}</span>
      <span className="t-ui-sm text-fg">{children}</span>
    </div>
  );
}

export function Skeleton({ w = "60%", h, className }: { w?: string | number; h?: 12 | 20 | 24; className?: string }) {
  return <span className={cn("p-skel", h === 12 && "p-skel--12", h === 20 && "p-skel--20", h === 24 && "p-skel--24", className)} style={{ width: w }} aria-hidden />;
}

export function DlRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="t-ui-sm">{label}</dt>
      <dd className="t-ui-sm">{children}</dd>
    </div>
  );
}

export function RegionHead({ eyebrow, n, children, className }: { eyebrow: ReactNode; n?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("region-head", className)}>
      <h2 className="t-eyebrow">{n ? <span className="p-eyebrow-n">{n}</span> : null}{eyebrow}</h2>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
