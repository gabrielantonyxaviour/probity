import Link from "next/link";
import type { ReactNode } from "react";
import { isExternal } from "./routes";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "accent" | "default" | "ghost";
  size?: "sm" | "md";
  className?: string;
  /** Overrides the accessible name when the visible label is only an arrow or abbreviation. */
  label?: string;
};

/** Pill action (DESIGN_SYSTEM_RULES section 5). Product links stay in the tab; http(s) links open a new one. */
export function PillLink({ href, children, variant = "default", size = "sm", className, label }: Props) {
  const cls = ["p-pill", variant === "default" ? "" : `p-pill--${variant}`, size === "md" ? "p-pill--md" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  if (isExternal(href)) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
        {children}
      </a>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a className={cls} href={href} aria-label={label}>
        {children}
      </a>
    );
  }
  return (
    <Link className={cls} href={href} aria-label={label}>
      {children}
    </Link>
  );
}
