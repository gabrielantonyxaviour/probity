import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

type ChipProps = {
  tone?: Tone | "real" | "synthetic";
  glyph?: ReactNode;
  prov?: boolean;
  outline?: "gap" | "conflict";
  fill?: boolean;
  large?: boolean;
  wrap?: boolean;
  running?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
  testId?: string;
  data?: Record<string, string | undefined>;
};

/** Micro-pill: always a leading glyph and a word. Colour reaches the chip only through the glyph (RULES section 5). */
export function Chip({ tone = "neutral", glyph, prov, outline, fill, large, wrap, running, className, title, children, testId, data }: ChipProps) {
  const dataAttrs: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(data ?? {})) dataAttrs[`data-${k}`] = v;
  return (
    <span
      className={cn("p-chip", wrap && "p-chip--wrap", large && "p-chip--lg", className)}
      data-tone={tone === "neutral" ? undefined : tone}
      data-prov={prov ? "true" : undefined}
      data-outline={outline}
      data-fill={fill ? "true" : undefined}
      data-running={running ? "true" : undefined}
      data-testid={testId}
      title={title}
      {...dataAttrs}
    >
      {running ? <span className="p-dot p-dot--sm p-pulse" aria-hidden /> : glyph ? <span className="p-chip__g" aria-hidden>{glyph}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export function Badge({ children, small, className, testId }: { children: ReactNode; small?: boolean; className?: string; testId?: string }) {
  return (
    <span className={cn("p-badge", small && "p-badge--sm", className)} data-testid={testId}>
      {children}
    </span>
  );
}

/** HonestyTag = Badge (UX-R18), e.g. "TEST ROUTING". Never coloured. */
export function HonestyTag({ children, className }: { children: ReactNode; className?: string }) {
  return <Badge small className={className}>{children}</Badge>;
}

export function StatusGlyph({ glyph, tone }: { glyph: string; tone: Tone }) {
  const color = tone === "agree" ? "var(--agree)" : tone === "gap" ? "var(--gap)" : tone === "conflict" ? "var(--conflict-text)" : tone === "info" ? "var(--info)" : "var(--fg-muted)";
  return <span className="p-glyph" style={{ color }} aria-hidden>{glyph}</span>;
}
