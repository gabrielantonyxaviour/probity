import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--ff-newsreader",
});
const sans = Hanken_Grotesk({ subsets: ["latin"], display: "swap", variable: "--ff-hanken" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--ff-plex-mono" });

export const metadata: Metadata = {
  title: { default: "Probity", template: "%s · Probity" },
  description: "Before the money moves, prove who is asking.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Applies the saved theme before first paint. Product routes only: the landing page is dark-only. */
const THEME_BOOT = `(function(){try{var p=location.pathname;if(p!=="/app"&&p.indexOf("/app/")!==0)return;var t=localStorage.getItem("pp-theme");if(t==="light"||t==="dark"||t==="system")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
