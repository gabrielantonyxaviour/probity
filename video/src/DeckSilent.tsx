import React from "react";
import { AbsoluteFill, Freeze, Sequence, useCurrentFrame } from "remotion";
import { RiverCanvas } from "./river/RiverCanvas";
import { deckWorld, DECK_SEGS, scrim } from "./timeline/deckPlan";
import { D01, D02, D03, D04 } from "./deck/slides1";
import { D05, D06, D07, D08, D09, D10 } from "./deck/slides2";
import { C } from "./system/tokens";

const SLIDES: Record<string, React.FC> = { D01, D02, D03, D04, D05, D06, D07, D08, D09, D10 };

const Scrim: React.FC = () => {
  const f = useCurrentFrame();
  const s = scrim(f);
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: s.height, background: C.ground, opacity: s.uniform }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${C.ground} 0%, ${C.ground} 38%, rgba(12,12,11,0) 62%)`, opacity: s.side }} />
    </>
  );
};

const FadeOut: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: Math.max(0, 1 - f / 9) }}>{children}</AbsoluteFill>;
};
const FadeIn: React.FC<{ children: React.ReactNode; delay: number }> = ({ children, delay }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: delay === 0 ? 1 : Math.min(1, Math.max(0, (f - delay) / 6)) }}>{children}</AbsoluteFill>;
};

/** DeckSilent: ten slide segments over the same world, no audio. build_pptx.py cuts one clip per segment. */
export const DeckSilent: React.FC = () => (
  <AbsoluteFill style={{ background: C.ground }}>
    <RiverCanvas world={deckWorld} />
    <Scrim />
    {DECK_SEGS.map((s, i) => {
      const Slide = SLIDES[s.id];
      const prev = i > 0 ? DECK_SEGS[i - 1] : null;
      const Prev = prev ? SLIDES[prev.id] : null;
      return (
        <React.Fragment key={s.id}>
          {prev && Prev ? (
            // The clip starts on the previous slide's held frame, which then clears over 9 frames.
            <Sequence from={s.start} durationInFrames={10} name={`${prev.id} held out`}>
              <FadeOut>
                <Freeze frame={prev.len - 1}>
                  <Prev />
                </Freeze>
              </FadeOut>
            </Sequence>
          ) : null}
          <Sequence from={s.start} durationInFrames={s.len} name={s.id}>
            <FadeIn delay={i === 0 ? 0 : 8}>
              <Slide />
            </FadeIn>
          </Sequence>
        </React.Fragment>
      );
    })}
  </AbsoluteFill>
);
