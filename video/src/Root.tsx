import React from "react";
import { Composition } from "remotion";
import { Film } from "./Film";
import { DeckSilent } from "./DeckSilent";
import { DECK_TOTAL } from "./timeline/deckPlan";
import { RiverOnly } from "./RiverOnly";
import { TL } from "./timeline/timeline";
import { script } from "./data/script";
import { SceneOnly } from "./SceneOnly";
import { VIDEO } from "./system/tokens";

const base = { fps: VIDEO.fps, width: VIDEO.width, height: VIDEO.height } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={TL.total} {...base} defaultProps={{ withAudio: true, motionOnly: false }} />
    <Composition id="MotionDraft" component={Film} durationInFrames={TL.total} {...base} defaultProps={{ withAudio: false, motionOnly: true }} />
    <Composition id="DeckSilent" component={DeckSilent} durationInFrames={DECK_TOTAL} {...base} />
    {script.motion.map((m) => {
      const seg = TL.byId.get(m.id);
      return seg ? (
        <Composition key={m.id} id={m.id} component={SceneOnly} durationInFrames={seg.len} {...base} defaultProps={{ start: seg.start }} />
      ) : null;
    })}
    <Composition id="RiverOnly" component={RiverOnly} durationInFrames={TL.total} {...base} />
  </>
);
