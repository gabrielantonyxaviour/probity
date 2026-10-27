import { useCurrentFrame } from "remotion";
import { seg } from "../timeline/timeline";
import { exitAlpha } from "../system/Text";

/** Local frame f, global frame g, length and overlay exit alpha for a motion scene. */
export function useScene(id: string) {
  const f = useCurrentFrame();
  const s = seg(id);
  return { f, g: s.start + f, len: s.len, start: s.start, alpha: exitAlpha(f, s.len) };
}
