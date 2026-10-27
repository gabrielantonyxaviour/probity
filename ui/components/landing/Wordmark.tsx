import Link from "next/link";

type Props = { href: string; size?: 20 | 24 };

/** Probity's own mark: a rounded box holding a check, then the name in the serif. Also used by the product shell. */
export function Wordmark({ href, size = 20 }: Props) {
  return (
    <Link href={href} className="l-wordmark" style={{ ["--wm" as string]: `${size}px` }}>
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
        <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 10.4l3.1 3.1 5.9-6.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Probity</span>
    </Link>
  );
}
