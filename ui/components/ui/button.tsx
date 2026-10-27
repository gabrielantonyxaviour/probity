import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type ButtonVariant = "accent" | "default" | "ghost" | "danger";
type Common = { variant?: ButtonVariant; busy?: boolean; busyLabel?: string; block?: boolean; large?: boolean; icon?: ReactNode; trailing?: ReactNode };

const cls = (o: Common, extra?: string) =>
  cn("p-btn", o.variant === "accent" && "p-btn--accent", o.variant === "ghost" && "p-btn--ghost", o.variant === "danger" && "p-btn--danger", o.block && "p-btn--block", o.large && "p-btn--lg", extra);

/** Pill button (RULES section 5). Busy swaps the label, locks the width and shows the pulse dot. */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & Common>(function Button(
  { variant = "default", busy, busyLabel, block, large, icon, trailing, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cls({ variant, block, large }, className)} disabled={disabled || busy} data-busy={busy ? "true" : undefined} {...rest}>
      {busy ? <span className="p-dot p-dot--sm p-pulse" aria-hidden /> : icon}
      <span>{busy && busyLabel ? busyLabel : children}</span>
      {!busy && trailing}
    </button>
  );
});

export function LinkButton({ href, variant = "default", block, large, icon, trailing, className, children, ...rest }: { href: string; className?: string; children: ReactNode } & Common & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={cls({ variant, block, large }, className)} {...rest}>
      {icon}
      <span>{children}</span>
      {trailing}
    </Link>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; small?: boolean }>(function IconButton(
  { label, small, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={cn("p-icon-btn", small && "p-icon-btn--sm", className)} {...rest}>
      {children}
    </button>
  );
});
