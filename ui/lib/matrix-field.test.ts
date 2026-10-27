import { describe, expect, it } from "vitest";
import { FIELD, T_STATIC_SECONDS, computeFrame } from "./matrix-field";
import { T_STATIC_SECONDS as VIDEO_T_STATIC, SPEED as VIDEO_SPEED } from "../../video/src/system/matrix-field";

describe("matrix-field canonical source", () => {
  it("keeps the landing hero frame and the film's last frame on the same clock", () => {
    expect(T_STATIC_SECONDS).toBe(VIDEO_T_STATIC);
    expect(FIELD.speed).toBe(VIDEO_SPEED);
  });
  it("shows caught cells at T_STATIC at the landing banner sizes", () => {
    for (const [c, r] of [[127, 20], [161, 19], [33, 14]] as const) {
      expect(computeFrame(c, r, T_STATIC_SECONDS).filter((v) => v === 6).length).toBeGreaterThan(0);
    }
  });
});
