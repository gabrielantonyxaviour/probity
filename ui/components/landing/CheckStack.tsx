import { PLATES } from "./copy";

/** Screen point for a plate coordinate (u, v) in [-1, 1]: a 2:1 isometric diamond centred at (312, 269). */
const pt = (u: number, v: number): string => `${(312 + 90 * (u - v)).toFixed(1)},${(269 + 45 * (u + v)).toFixed(1)}`;
const line = (a: [number, number], b: [number, number]) => `M${pt(...a)}L${pt(...b)}`;
const poly = (pts: [number, number][]) => `M${pts.map((p) => pt(...p)).join("L")}Z`;

const OUTLINE = poly([[-1, -1], [1, -1], [1, 1], [-1, 1]]);
const ptDown = (u: number, v: number, dy: number): string => {
  const [x, y] = pt(u, v).split(",").map(Number);
  return `${x},${y + dy}`;
};
/** Plate thickness: the two visible side faces. */
const EDGE_L = `M${pt(-1, 1)}L${pt(1, 1)}L${ptDown(1, 1, 8)}L${ptDown(-1, 1, 8)}Z`;
const EDGE_R = `M${pt(1, 1)}L${pt(1, -1)}L${ptDown(1, -1, 8)}L${ptDown(1, 1, 8)}Z`;

/** Hairline detail drawn on each plate: what that source contributes. */
const DETAIL: Record<(typeof PLATES)[number]["id"], { d: string; focus: [number, number] }> = {
  letter: {
    d: [-0.55, -0.35, -0.15, 0.05, 0.25].map((v, i) => line([-0.7, v], [0.7 - i * 0.12, v])).join("") +
      poly([[-0.2, 0.0], [0.62, 0.0], [0.62, 0.3], [-0.2, 0.3]]),
    focus: [0.2, 0.15],
  },
  records: {
    d: [-0.6, -0.2, 0.2, 0.6].map((u) => line([u, -0.65], [u, 0.65])).join("") +
      [-0.65, -0.25, 0.15, 0.55].map((v) => line([-0.6, v], [0.6, v])).join(""),
    focus: [0.2, -0.25],
  },
  awards: {
    d: line([-0.6, 0], [0, 0]) + line([0, 0], [0.55, -0.45]) + line([0, 0], [0.55, 0.45]) + line([0, 0], [0.55, 0]) +
      [[-0.6, 0], [0, 0], [0.55, -0.45], [0.55, 0.45], [0.55, 0]].map(([u, v]) => circle(u, v)).join(""),
    focus: [0.55, 0],
  },
  filings: {
    d: [-0.55, -0.35, -0.15].map((v) => line([-0.7, v], [0.2, v])).join("") + circle(0.45, 0.35, 0.16) + line([0.3, 0.1], [0.6, 0.1]),
    focus: [0.45, 0.35],
  },
};

/** A circle on the plate plane is an ellipse on screen. */
function circle(u: number, v: number, r = 0.07): string {
  const [x, y] = pt(u, v).split(",").map(Number);
  const rx = 90 * r * 1.4;
  const ry = 45 * r * 1.4;
  return `M${x - rx},${y}a${rx},${ry} 0 1,0 ${2 * rx},0a${rx},${ry} 0 1,0 ${-2 * rx},0`;
}

/** Original isometric stack of four hairline plates (viewBox 624x538). Offsets arrive as --plate-N from the scroll hook. */
export function CheckStack({ activePlate }: { activePlate: number | null }) {
  return (
    <svg className="l-stack" viewBox="0 0 624 538" role="img" aria-label="Four hairline plates: the letter, our records, USAspending and SEC EDGAR">
      {[3, 2, 1, 0].map((i) => {
        const plate = PLATES[i];
        const detail = DETAIL[plate.id];
        const [fx, fy] = pt(...detail.focus).split(",").map(Number);
        return (
          <g key={plate.id} className="l-plate" data-state={activePlate === i ? "active" : undefined} style={{ transform: `translateY(calc(var(--plate-${i}) * 1px))` }}>
            <path className="l-plate-face" d={OUTLINE} />
            <path className="l-plate-edge" d={EDGE_L} />
            <path className="l-plate-edge" d={EDGE_R} />
            <path className="l-plate-detail" d={detail.d} />
            <g className="l-annot-g" aria-hidden="true">
              <path className="l-annot-leader" d={`M${fx},${fy}L${fx},84`} pathLength={1} />
              <circle className="l-annot-end" cx={fx} cy={fy} r="2.5" />
              <text className="l-annot-text" x={fx} y="76" textAnchor="middle">
                {plate.note}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
