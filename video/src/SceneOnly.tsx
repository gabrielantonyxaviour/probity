import React from "react";
import { Sequence } from "remotion";
import { Film } from "./Film";

/** Isolated render of one motion scene: the film shifted so that local frame 0 is the scene's first frame (world, overlay and all). */
export const SceneOnly: React.FC<{ start: number }> = ({ start }) => (
  <Sequence from={-start} layout="none">
    <Film withAudio={false} motionOnly />
  </Sequence>
);
