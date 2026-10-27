import { ImageResponse } from "next/og";
import { FIELD, computeFrame } from "@/components/landing/matrix/matrix-field";

export const alt = "Probity: verify the payee, not the paperwork";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Rendered once at build. Fonts come from Google Fonts; with no network the image falls back to the default face.

// The only file in the landing lane allowed hex literals: ImageResponse cannot read CSS variables.
const C = {
  canvas: "#0c0c0b", // --stone-1100 (--bg-canvas)
  fg: "#f9f5ef", // --stone-100 (--fg)
  fg2: "#d4cfc6", // --stone-400 (--fg-2)
  rule: "#363533", // --stone-900 (--rule)
  tiers: [
    "#1a1918", // --stone-1000 (--matrix-t1)
    "#2c2a28", // --stone-950 (--matrix-t2)
    "#514e4b", // --stone-800 (--matrix-t3)
    "#959089", // --stone-600 (--matrix-t4)
    "#959089", // --stone-600 (diverted branch)
    "#f85156", // --red-500 (--hold, caught)
  ],
} as const;
const GLYPHS = ["·", ":", "$", "$", "$", "×"] as const;

/** Google Fonts serves TTF to a UA it does not recognise; satori cannot read woff2. Any failure falls back to the default face. */
const fontCache = new Map<string, ArrayBuffer>();

async function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const data = await (await fetch(url)).arrayBuffer();
    fontCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [serif, mono] = await Promise.all([googleFont("Newsreader", 300), googleFont("IBM+Plex+Mono", 400)]);
  const cols = size.width / FIELD.cellW;
  const rows = 12;
  const frame = computeFrame(cols, rows, FIELD.T_STATIC);
  const fonts = [
    ...(serif ? [{ name: "Newsreader", data: serif, weight: 300 as const }] : []),
    ...(mono ? [{ name: "Plex", data: mono, weight: 400 as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.canvas, color: C.fg, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", padding: "56px 64px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "Newsreader", fontSize: 30, fontWeight: 300 }}>
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
              <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4" stroke={C.fg} strokeWidth="1.5" />
              <path d="M5.5 10.4l3.1 3.1 5.9-6.9" stroke={C.fg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Probity
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 56, fontFamily: "Newsreader", fontWeight: 300, fontSize: 92, lineHeight: 1, letterSpacing: "-0.03em" }}>
            <span>Verify the payee,</span>
            <span>not the paperwork.</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${C.rule}`, marginBottom: 48, paddingTop: 8 }}>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} style={{ display: "flex", height: FIELD.cellH }}>
              {Array.from({ length: cols }, (_, c) => {
                const tier = frame[r * cols + c];
                return (
                  <span key={c} style={{ display: "flex", width: FIELD.cellW, justifyContent: "center", fontFamily: "Plex", fontSize: 12, color: tier ? C.tiers[tier - 1] : C.canvas }}>
                    {tier ? GLYPHS[tier - 1] : " "}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
