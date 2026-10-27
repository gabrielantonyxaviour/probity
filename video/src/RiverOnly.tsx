import React from "react";
import { AbsoluteFill } from "remotion";
import { RiverCanvas } from "./river/RiverCanvas";
import { C } from "./system/tokens";

export const RiverOnly: React.FC = () => (
  <AbsoluteFill style={{ background: C.ground }}>
    <RiverCanvas />
  </AbsoluteFill>
);
