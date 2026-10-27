import type { Metadata } from "next";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"),
  title: { absolute: "Probity" },
  description: "Before the money moves, prove who is asking.",
  icons: { icon: "/landing/favicon.svg" },
};

/** The landing is dark-only. `light-dark()` tokens resolve per element, so this wrapper pins the scheme. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="l-root" data-theme="dark" style={{ colorScheme: "dark", background: "var(--bg-canvas)", minHeight: "100dvh" }}>
      {children}
    </div>
  );
}
