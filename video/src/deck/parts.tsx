import React from "react";
import { Freeze, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { C, FONT, VIDEO } from "../system/tokens";
import { Eyebrow, Serif, monoStyle, Awaiting } from "../system/Text";
import { useAssetExists } from "../system/useAsset";
import { slotsFile } from "../data/slots";
import { deck } from "../data/deck";
import { ease, bez, clamp01 } from "../system/motion";

export const fade = (f: number, at: number, len = 15) => bez(ease.content)(clamp01((f - at) / len));
export const NOTICE = "Registry facts: live USAspending and SEC EDGAR data, joined in Zetaris";

/** Slide chrome: mono eyebrow + serif title (exact 08 section 4 string), optional source footer. */
export const SlideHead: React.FC<{ f: number; id: string; eyebrow: string; size?: number; width?: number; top?: number }> = ({ f, id, eyebrow, size = 58, width = 1500, top = 84 }) => {
  const s = deck.slides.find((x) => x.id === id);
  return (
    <div style={{ position: "absolute", left: 120, top, width }}>
      <Eyebrow frame={f} at={2} style={{ marginBottom: 20 }}>{eyebrow}</Eyebrow>
      <Serif frame={f} at={4} size={size}>{s?.title}</Serif>
    </div>
  );
};
export const Notice: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: "absolute", left: 120, bottom: 44, ...monoStyle, fontSize: 12, color: C.muted, opacity: fade(f, 20), borderTop: `1px solid ${C.rule}`, paddingTop: 12, width: 1680 }}>{NOTICE}</div>
);

/** A frozen frame of a real recording (a screenshot cut from the same file the film uses); a marked placeholder when absent. */
export const Media: React.FC<{ slot: string; at: number; label: string; w: number; h: number; style?: React.CSSProperties; f?: number; show?: number }> = ({ slot, at, label, w, h, style, f = 99, show = 12 }) => {
  const cfg = slotsFile.slots.find((s) => s.id === slot);
  const hasCut = useAssetExists(cfg ? `cut/${cfg.file}` : "cut/none", "video");
  const hasRaw = useAssetExists(cfg ? `raw/${cfg.file}` : "raw/none", "video");
  const present = hasCut || hasRaw;
  return (
    <div style={{ width: w, height: h, border: `1px solid ${C.rule}`, background: C.ground, position: "relative", overflow: "hidden", opacity: fade(f, show), ...style }}>
      {present && cfg ? (
        // Held for the whole slide: Freeze pins the clip at `at` seconds (a 1-frame Sequence would vanish after frame 0).
        <Freeze frame={Math.round(at * VIDEO.fps)}>
          <OffthreadVideo src={staticFile(`${hasCut ? "cut" : "raw"}/${cfg.file}`)} muted style={{ width: w, height: h, objectFit: "cover" }} />
        </Freeze>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 24 }}>
          <div style={{ ...monoStyle, fontSize: 14, color: C.fg }}>RECORDING SLOT {slot} · {label}</div>
          <div style={{ ...monoStyle, fontSize: 11, color: C.muted }}>from a live run · frame at {at} s</div>
        </div>
      )}
    </div>
  );
};
export const Cap: React.FC<{ children: React.ReactNode; f: number; at: number; style?: React.CSSProperties }> = ({ children, f, at, style }) => (
  <div style={{ ...monoStyle, fontSize: 12, color: C.muted, marginTop: 12, opacity: fade(f, at), ...style }}>{children}</div>
);
export const Body: React.FC<{ children: React.ReactNode; f: number; at: number; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, f, at, size = 22, color = C.fg2, style }) => (
  <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: size, lineHeight: 1.4, color, opacity: fade(f, at), ...style }}>{children}</div>
);
export const useLocal = () => useCurrentFrame();
export { Serif, Eyebrow, Awaiting, monoStyle, C, FONT };
