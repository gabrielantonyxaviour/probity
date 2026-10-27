import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { C, VIDEO } from "../system/tokens";
import { monoStyle } from "../system/Text";
import { ease, bez, clamp01, msToFrames } from "../system/motion";
import { useAssetExists } from "../system/useAsset";
import { clipFor } from "../data/clips";
import type { Seg } from "../timeline/timeline";

const WIPE = msToFrames(600); // 600 ms left to right, both into and out of a recording
const COL_W = VIDEO.columnWidth;
const COL_H = Math.round((COL_W * 9) / 16);
const COL_TOP = 118;

/** Plays docs/video/raw/<file> at its slot length; a marked placeholder when the file is absent. Never imitates product UI. */
export const RecordingSlot: React.FC<{ seg: Seg; showPlaceholder?: boolean }> = ({ seg, showPlaceholder = true }) => {
  const frame = useCurrentFrame();
  const slot = seg.slot;
  // A film cut (docs/video/cut/<file>, made by video/scripts/cut.py at exactly the slot length) wins over the raw take.
  const hasCut = useAssetExists(slot ? `cut/${slot.file}` : "cut/none", "video");
  const hasRaw = useAssetExists(slot ? `raw/${slot.file}` : "raw/none", "video");
  const present = hasCut || hasRaw;
  const src = slot ? `${hasCut ? "cut" : "raw"}/${slot.file}` : "";
  if (!slot || seg.len === 0) return null;
  const e = bez(ease.inOut);
  const inP = e(clamp01(frame / WIPE));
  const outP = e(clamp01((frame - (seg.len - WIPE)) / WIPE));
  const clip = `inset(0 ${(1 - inP) * 100}% 0 ${outP * 100}%)`;
  const clipInfo = clipFor(slot.id);
  const trimmed = clipInfo?.trimmed_seconds ?? null;
  const caption = clipInfo?.caption ?? (trimmed ? `wait trimmed: ${trimmed} s` : null);
  const left = (VIDEO.width - COL_W) / 2;
  return (
    <AbsoluteFill style={{ clipPath: clip }}>
      <div
        style={{
          position: "absolute", left, top: COL_TOP, width: COL_W, height: COL_H, background: C.ground,
          outline: `1px solid ${C.rule}`, boxShadow: `0 0 0 1px ${C.rule}`,
        }}
      >
        {present ? (
          <OffthreadVideo src={staticFile(src)} muted startFrom={0} endAt={seg.len} style={{ width: COL_W, height: COL_H, objectFit: "cover" }} />
        ) : (
          showPlaceholder && <Placeholder id={slot.id} title={slot.title} seconds={slot.seconds} kind={slot.kind} />
        )}
        {caption ? (
          <div style={{ ...monoStyle, position: "absolute", right: 24, bottom: 20, fontSize: 15, color: C.fg, background: "rgba(12,12,11,0.72)", padding: "6px 10px", border: `1px solid ${C.rule}` }}>
            {caption}
          </div>
        ) : null}
      </div>
      {slot.lower_third ? (
        <div style={{ position: "absolute", left, top: COL_TOP + COL_H + 26, width: COL_W, borderTop: `1px solid ${C.rule}`, paddingTop: 16 }}>
          <div style={{ ...monoStyle, fontSize: 15, color: C.fg2 }}>{slot.lower_third}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Placeholder: React.FC<{ id: string; title: string; seconds: number; kind: string }> = ({ id, title, seconds, kind }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center", padding: 60 }}>
    <div style={{ ...monoStyle, fontSize: 22, color: C.fg }}>
      RECORDING SLOT {id} · {title} · {seconds} S · FROM A LIVE RUN
    </div>
    <div style={{ ...monoStyle, fontSize: 14, color: C.muted, maxWidth: 900, lineHeight: 1.5 }}>{kind}</div>
    <div style={{ ...monoStyle, fontSize: 12, color: C.subtle }}>docs/video/raw drop-in, no code change</div>
  </div>
);

/** MotionDraft only: the river keeps flowing through a recording slot; a quiet marker says what will be here. */
export const SlotMarker: React.FC<{ seg: Seg }> = ({ seg }) => {
  const frame = useCurrentFrame();
  const slot = seg.slot;
  if (!slot) return null;
  const a = Math.min(1, frame / 12) * Math.min(1, (seg.len - frame) / 12);
  return (
    <div style={{ position: "absolute", left: 120, bottom: 70, opacity: a, borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>
      <div style={{ ...monoStyle, fontSize: 13, color: C.muted }}>
        Recording slot {slot.id} · {slot.title} · {slot.seconds} s · from a live run
      </div>
    </div>
  );
};
