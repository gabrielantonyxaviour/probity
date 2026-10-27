// Canonical payment-river field (wave1-decisions item 4). The landing implementation is the source; the video
// (video/src/system/matrix-field.ts) mirrors it and must keep T_STATIC_SECONDS equal to FIELD.T_STATIC (23.5 s).
export * from "../components/landing/matrix/matrix-field";
import { FIELD } from "../components/landing/matrix/matrix-field";

/** The static frame both the landing hero and the film's last frame draw, in wall-clock seconds. */
export const T_STATIC_SECONDS = FIELD.T_STATIC;
