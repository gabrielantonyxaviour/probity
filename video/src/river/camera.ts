// Pinhole camera with a perspective <-> orthographic continuum (fov shrinks, camera pulls back).
export interface Cam {
  x: number;
  y: number;
  z: number;
  yaw: number; // degrees about +Y; 0 looks down +x (down-river)
  pitch: number; // degrees; negative looks down
  fov: number; // vertical degrees; <= 4 reads as orthographic
}
export const camKeys: (keyof Cam)[] = ["x", "y", "z", "yaw", "pitch", "fov"];

export interface Projector {
  w: number;
  h: number;
  /** world -> [sx, sy, depth]; depth <= 0.05 means behind the camera */
  project(x: number, y: number, z: number, out: Float64Array): void;
}

export function makeProjector(cam: Cam, w: number, h: number): Projector {
  const yaw = (cam.yaw * Math.PI) / 180;
  const pit = (cam.pitch * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  const f = h / 2 / Math.tan((cam.fov * Math.PI) / 360);
  // forward = (cy*cp, sp, sy*cp); right = (-sy, 0, cy); up = right x forward... built explicitly
  const fx = cy * cp, fy = sp, fz = sy * cp;
  const rx = -sy, rz = cy;
  const ux = -sp * cy, uy = cp, uz = -sp * sy;
  return {
    w,
    h,
    project(x, y, z, out) {
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const d = dx * fx + dy * fy + dz * fz;
      const px = dx * rx + dz * rz;
      const py = dx * ux + dy * uy + dz * uz;
      out[2] = d;
      if (d < 0.05) {
        out[0] = -1e6;
        out[1] = -1e6;
        return;
      }
      out[0] = w / 2 + (f * px) / d;
      out[1] = h / 2 - (f * py) / d;
    },
  };
}

export function lerpCam(a: Cam, b: Cam, t: number): Cam {
  const o = {} as Cam;
  for (const k of camKeys) {
    if (k === "fov") continue;
    o[k] = a[k] + (b[k] - a[k]) * t;
  }
  o.fov = Math.exp(Math.log(a.fov) + (Math.log(b.fov) - Math.log(a.fov)) * t);
  return o;
}
