import { camAt } from "../river/world";
import { makeProjector } from "../river/camera";
import { VIDEO } from "./tokens";

const out = new Float64Array(3);
/** Project a world point to screen px under the film camera at a global frame (labels ride the 3D world). */
export function anchor(globalFrame: number, x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
  makeProjector(camAt(globalFrame), VIDEO.width, VIDEO.height).project(x, y, z, out);
  return { x: out[0], y: out[1], visible: out[2] > 0.3 };
}
