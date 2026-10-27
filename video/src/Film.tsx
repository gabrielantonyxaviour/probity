import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { RiverCanvas } from "./river/RiverCanvas";
import { RecordingSlot, SlotMarker } from "./scenes/RecordingSlot";
import { M01 } from "./scenes/M01";
import { M02 } from "./scenes/M02";
import { M03 } from "./scenes/M03";
import { M04 } from "./scenes/M04";
import { M05 } from "./scenes/M05";
import { M06 } from "./scenes/M06";
import { M07 } from "./scenes/M07";
import { M08 } from "./scenes/M08";
import { M09 } from "./scenes/M09";
import { TL, seg, type Seg } from "./timeline/timeline";
import { script } from "./data/script";
import { useAssetExists } from "./system/useAsset";
import { C } from "./system/tokens";
import { Captions } from "./scenes/Captions";

const SCENES: Record<string, React.FC> = { M01, M02, M03, M04, M05, M06, M07, M08, M09 };

const NarrationTrack: React.FC<{ id: string; file: string; from: number }> = ({ file, from }) => {
  const present = useAssetExists(`audio/${file}`, "audio");
  return present ? (
    <Sequence from={from}>
      <Audio src={staticFile(`audio/${file}`)} />
    </Sequence>
  ) : null;
};

/** The whole film: one persistent world, overlays and recordings on top. withAudio=false renders DeckSilent-style silent video. */
export const Film: React.FC<{ withAudio?: boolean; motionOnly?: boolean }> = ({ withAudio = true, motionOnly = false }) => (
  <AbsoluteFill style={{ background: C.ground }}>
    <RiverCanvas />
    {TL.segs.map((s: Seg) => {
      if (s.len === 0) return null;
      if (s.kind === "slot") {
        if (motionOnly) {
          return (
            <Sequence key={s.id} from={s.start} durationInFrames={s.len} name={`${s.id} marker`}>
              <SlotMarker seg={s} />
            </Sequence>
          );
        }
        return (
          <Sequence key={s.id} from={s.start} durationInFrames={s.len} name={`${s.id} ${s.slot?.title ?? ""}`}>
            <RecordingSlot seg={s} />
          </Sequence>
        );
      }
      const Scene = SCENES[s.id];
      return Scene ? (
        <Sequence key={s.id} from={s.start} durationInFrames={s.len} name={s.id}>
          <Scene />
        </Sequence>
      ) : null;
    })}
    {withAudio && !motionOnly
      ? script.narration.map((n) => {
          const first = n.covers.map((c) => seg(c)).find((s) => s.len > 0);
          return first ? <NarrationTrack key={n.id} id={n.id} file={n.audio} from={first.start} /> : null;
        })
      : null}
    {withAudio && !motionOnly ? <Captions /> : null}
  </AbsoluteFill>
);
