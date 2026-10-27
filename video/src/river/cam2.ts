// Target-based camera: a point on the plane, yaw/pitch, fov and px-per-unit scale at the target.
// Persp <-> iso is a dolly-zoom: fov shrinks while the camera pulls back so the target keeps its on-screen size.
import type { Cam } from "./camera";
import { VIDEO } from "../system/tokens";

export interface Cam2 {
  tx: number;
  ty: number;
  tz: number;
  yaw: number;
  pitch: number;
  fov: number;
  scale: number; // px per world unit at the target
}
const keys = ["tx", "ty", "tz", "yaw", "pitch"] as const;

export function resolve(c: Cam2): Cam {
  const yaw = (c.yaw * Math.PI) / 180;
  const pit = (c.pitch * Math.PI) / 180;
  const f = VIDEO.height / 2 / Math.tan((c.fov * Math.PI) / 360);
  const D = f / c.scale;
  const fx = Math.cos(yaw) * Math.cos(pit), fy = Math.sin(pit), fz = Math.sin(yaw) * Math.cos(pit);
  return { x: c.tx - fx * D, y: c.ty - fy * D, z: c.tz - fz * D, yaw: c.yaw, pitch: c.pitch, fov: c.fov };
}

export function lerp2(a: Cam2, b: Cam2, t: number): Cam2 {
  const o = {} as Cam2;
  for (const k of keys) o[k] = a[k] + (b[k] - a[k]) * t;
  o.fov = Math.exp(Math.log(a.fov) + (Math.log(b.fov) - Math.log(a.fov)) * t);
  o.scale = Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * t);
  return o;
}

/** River shot: camera at (x, h, 0) pitched down by `pitchDeg`, 35 degree lens. */
export const RIVER_YAW = -72; // glyphs stay legible: the river flows left to right and away (landing hero direction)
export function river(x: number, h: number, pitchDeg: number, tz = 0): Cam2 {
  const p = (pitchDeg * Math.PI) / 180;
  const D = h / Math.sin(-p);
  const fov = 35;
  const f = VIDEO.height / 2 / Math.tan((fov * Math.PI) / 360);
  return { tx: x, ty: 0, tz, yaw: RIVER_YAW, pitch: pitchDeg, fov, scale: f / D };
}
/** Orthographic isometric shot (fov 3, 30 degree elevation) looking at (tx, ty, tz). */
export function iso(tx: number, ty: number, tz: number, yaw: number, scale: number, pitch = -30): Cam2 {
  return { tx, ty, tz, yaw, pitch, fov: 3, scale };
}
/** Straight-down orthographic shot, +x to the right: 100 px/unit makes a cell 12 x 14 px (landing banner). */
export function topDown(tx: number, tz: number, scale = 100): Cam2 {
  return { tx, ty: 0, tz, yaw: -90, pitch: -90, fov: 3, scale };
}
