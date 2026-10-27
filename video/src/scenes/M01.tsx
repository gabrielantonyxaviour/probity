import React from "react";
import { AbsoluteFill } from "remotion";
import { Eyebrow, Serif } from "../system/Text";
import { useScene } from "./useScene";

/** M01 river-open: black, the river rises from the bed tier, slow dolly down-river. Text arrives after the river is established. */
export const M01: React.FC = () => {
  const { f, alpha } = useScene("M01");
  return (
    <AbsoluteFill style={{ opacity: alpha }}>
      <div style={{ position: "absolute", left: 120, bottom: 150 }}>
        <Eyebrow frame={f} at={84} style={{ marginBottom: 22 }}>Accounts payable · a payment run</Eyebrow>
        <Serif frame={f} at={90} size={60}>Money moves in a river.</Serif>
      </div>
    </AbsoluteFill>
  );
};
