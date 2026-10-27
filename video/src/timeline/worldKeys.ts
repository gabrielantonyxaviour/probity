// Camera keyframes for the whole film. One move per shot, bezier(.65,0,.35,1), chained end to start with no cut.
import { river, iso, topDown, type Cam2 } from "../river/cam2";
import { at, endOf } from "./timeline";
import { cellX } from "../river/cells";

export const STREAMS_VIEW = iso(15.5, 0, 0, -40, 62);
export const PLANES_VIEW = iso(10.2, 0.4, 0.4, -45, 72);
export const HOLD_VIEW: Cam2 = { tx: 14.2, ty: 0, tz: -0.9, yaw: -90, pitch: -55, fov: 35, scale: 150 };
export const BANNER_TX = cellX(80);
export const BANNER_TZ = -2.6; // puts the banner centre at y = 800 px
export const BANNER_VIEW = topDown(BANNER_TX, BANNER_TZ, 100);

export interface CamKey {
  f: number;
  cam: Cam2;
}

export function buildCamKeys(): CamKey[] {
  const k: CamKey[] = [
    { f: 0, cam: river(0.4, 1.2, -15) },
    { f: endOf("M01"), cam: river(3.4, 1.2, -14) },
    { f: endOf("R01"), cam: river(6.0, 1.3, -15) },
    { f: endOf("M02"), cam: river(12.6, 3.4, -27, 0.9) },
    { f: at("M03", 1.7), cam: STREAMS_VIEW },
    { f: at("M03", -1.0), cam: STREAMS_VIEW },
    { f: endOf("M03"), cam: river(13.6, 2.0, -22, 0.8) },
    { f: at("M04", 3.0), cam: river(15.0, 1.7, -24, 0.8) },
    { f: endOf("M04"), cam: river(15.0, 1.7, -24, 0.8) },
    { f: endOf("R02"), cam: river(12.0, 1.3, -15) },
    { f: at("M05", 1.5), cam: PLANES_VIEW },
    { f: at("M05", -1.0), cam: PLANES_VIEW },
    { f: endOf("M05"), cam: river(8.0, 1.3, -15) },
    { f: endOf("R03"), cam: river(6.0, 1.3, -15) },
    { f: endOf("R05"), cam: river(9.5, 1.3, -16) },
    { f: endOf("R07"), cam: river(11.5, 1.4, -16) },
    { f: at("M06", 1.7), cam: STREAMS_VIEW },
    { f: at("M06", -1.0), cam: STREAMS_VIEW },
    { f: endOf("M06"), cam: river(12.0, 1.4, -16) },
    { f: endOf("R10"), cam: river(13.0, 1.2, -15) },
    { f: endOf("M07"), cam: river(14.0, 1.2, -15) },
    { f: endOf("R13"), cam: river(10.0, 2.5, -22) },
    { f: at("M08", 1.2), cam: HOLD_VIEW },
    { f: endOf("M08"), cam: HOLD_VIEW },
    { f: at("M09", 3.6), cam: BANNER_VIEW },
    { f: endOf("M09"), cam: BANNER_VIEW },
  ];
  // Keep strictly increasing frames (disabled slots collapse neighbouring keys onto one frame; the later key wins).
  const out: CamKey[] = [];
  for (const key of k.sort((a, b) => a.f - b.f)) {
    if (out.length && out[out.length - 1].f === key.f) out[out.length - 1] = key;
    else out.push(key);
  }
  return out;
}
