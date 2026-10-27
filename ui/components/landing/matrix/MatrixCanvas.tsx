"use client";

import { useRef } from "react";
import { HERO } from "../copy";
import { useMatrixCanvas } from "./useMatrixCanvas";

type Props = {
  /** Banner height in px. Omitted: 254 from 640px up, 180 below (token --matrix-h). */
  height?: 254 | 180 | 128;
  /** One static frame at T_STATIC, no animation (dossier cover, empty queue). */
  static?: boolean;
  /** Full-bleed 100vw banner (landing). Product reuse passes false to fit its own frame. */
  bleed?: boolean;
};

/** The payment river: payments flow right, one diverted branch is caught at a gate. Canvas 2D, decorative. */
export function MatrixCanvas({ height, static: isStatic = false, bleed = true }: Props) {
  const hostRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useMatrixCanvas(hostRef, canvasRef, { staticFrame: isStatic });
  const style = height ? { ["--matrix-h" as string]: `${height}px` } : undefined;
  return (
    <figure ref={hostRef} className={bleed ? "l-matrix l-matrix--bleed" : "l-matrix"} style={style} data-static={isStatic || undefined}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="l-annot" aria-hidden="true">
        <span className="l-annot-label t-mono-label">{HERO.gateLabel}</span>
        <span className="l-annot-line" />
        <span className="l-annot-dot" />
      </div>
      <figcaption className="l-sr-only">{HERO.matrixCaption}</figcaption>
    </figure>
  );
}
