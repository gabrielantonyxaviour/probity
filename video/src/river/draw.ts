import { N, CW, CH, type CellBuf } from "./cells";
import { makeProjector, type Cam } from "./camera";
import { sprite, SPRITE_W } from "./atlas";
import { C } from "../system/tokens";

const FOG_NEAR = 8;
const FOG_FAR = 40;
const keys = new Float64Array(N);
const P = new Float64Array(3);
const Q = new Float64Array(3);
const R = new Float64Array(3);
const S = {
  x: new Float32Array(N), y: new Float32Array(N), ax: new Float32Array(N), ay: new Float32Array(N),
  bx: new Float32Array(N), by: new Float32Array(N), a: new Float32Array(N),
};

/**
 * Every cell is a horizontal quad (width along +x, height along +z). Its glyph sprite is drawn with the quad's true
 * projected basis, so foreshortening and skew are those of a real 3D plane under the current camera.
 */
export function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Cam, buf: CellBuf, focus = 4.6): number {
  // focus = camera distance to the look-at point. Fog and depth sorting are measured around it, so the dolly-zoom
  // between perspective and isometric (camera hundreds of units away) never fogs the world out.
  const fogShift = Math.max(0, focus - 4.6);
  const fogNear = FOG_NEAR + fogShift;
  const fogFar = FOG_FAR + fogShift;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const pr = makeProjector(cam, w, h);
  const ortho = cam.fov <= 4;
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (buf.g[i] === 0 || buf.a[i] < 0.02) continue;
    const x = buf.x[i], y = buf.y[i], z = buf.z[i];
    pr.project(x, y, z, P);
    const d = P[2];
    if (d < 0.3 || P[0] < -80 || P[0] > w + 80 || P[1] < -80 || P[1] > h + 80) continue;
    const fog = ortho ? 1 : Math.max(0, Math.min(1, 1 - (d - fogNear) / (fogFar - fogNear)));
    const a = buf.a[i] * fog;
    if (a < 0.02) continue;
    pr.project(x + CW, y, z, Q);
    pr.project(x, y, z + CH, R);
    const ax = Q[0] - P[0], ay = Q[1] - P[1], bx = R[0] - P[0], by = R[1] - P[1];
    if (Math.hypot(ax, ay) < 1.2) continue;
    S.x[i] = P[0]; S.y[i] = P[1]; S.ax[i] = ax; S.ay[i] = ay; S.bx[i] = bx; S.by[i] = by; S.a[i] = a;
    const q = Math.max(0, Math.min(65535, Math.floor((0.5 - (d - focus) / 160) * 65535)));
    keys[n++] = q * 16384 + i;
  }
  const order = keys.subarray(0, n);
  order.sort();
  for (let k = 0; k < n; k++) {
    const i = order[k] % 16384;
    const len = Math.hypot(S.ax[i], S.ay[i]);
    const lvl = len > 20 ? 0 : len > 10 ? 1 : 2;
    const sp = sprite(buf.g[i], buf.c[i], lvl);
    const sw = SPRITE_W[lvl];
    const sh = sp.height;
    ctx.globalAlpha = S.a[i];
    ctx.setTransform(S.ax[i] / sw, S.ay[i] / sw, S.bx[i] / sh, S.by[i] / sh, S.x[i], S.y[i]);
    ctx.drawImage(sp, -sw / 2, -sh / 2);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  return n;
}
