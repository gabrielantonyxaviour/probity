import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../system/tokens";
import { Eyebrow, Serif } from "../system/Text";
import { Annotation } from "./Annotation";
import { useScene } from "./useScene";
import { anchor } from "../system/anchor";
import { catchCentre, FLIP_START } from "../river/world";

/** M04 catch: the diverted branch reaches the gate. Cell flips, dimming and the push-in are the world's; this is the text. */
export const M04: React.FC = () => {
  const { f, g, alpha, start } = useScene("M04");
  const fl = FLIP_START - start;
  const cc = catchCentre();
  const gate = anchor(g, cc.x, 0, cc.z);
  return (
    <AbsoluteFill style={{ opacity: 1 }}>
      <div style={{ position: "absolute", left: 120, bottom: 150, opacity: alpha }}>
        <Eyebrow frame={f} at={fl - 8} color={C.holdText} style={{ marginBottom: 20 }}>The gate</Eyebrow>
        <Serif frame={f} at={fl - 4} size={60}>Stopped before the money moves.</Serif>
      </div>
      {gate.visible ? <Annotation frame={f} at={fl + 12} x={gate.x} y={gate.y} dx={-120} dy={-130} label="Held before release" color={C.fg2} alpha={alpha} /> : null}
    </AbsoluteFill>
  );
};
