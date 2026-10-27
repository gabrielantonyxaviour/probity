// Frame-accurate page capture through the Chrome DevTools screencast, encoded to H.264 with ffmpeg.
// Playwright's own recordVideo is capped at the CSS viewport size and a low bitrate, so text is soft; the screencast
// delivers JPEG frames at the device pixel ratio (deviceScaleFactor 2 gives 3840x2160), which ffmpeg downsamples to 1920x1080.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, CDPSession, Page } from "@playwright/test";

export type Capture = { stop(outFile: string): Promise<{ frames: number; seconds: number }> };

export async function startCapture(ctx: BrowserContext, page: Page, o: { workDir: string; scale: number; quality?: number; keepFrames?: boolean }): Promise<Capture> {
  rmSync(o.workDir, { recursive: true, force: true });
  mkdirSync(o.workDir, { recursive: true });
  const cdp: CDPSession = await ctx.newCDPSession(page);
  const frames: Array<{ file: string; t: number }> = [];
  let pending = Promise.resolve();
  let closed = false;
  cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    if (closed) return;
    const t = f.metadata.timestamp ?? Date.now() / 1000;
    const file = path.join(o.workDir, `f${String(frames.length).padStart(6, "0")}.jpg`);
    frames.push({ file, t });
    pending = pending.then(async () => {
      writeFileSync(file, Buffer.from(f.data, "base64"));
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
    });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: o.quality ?? 92, maxWidth: Math.round(1920 * o.scale), maxHeight: Math.round(1080 * o.scale), everyNthFrame: 1 });
  return {
    async stop(outFile) {
      await new Promise((r) => setTimeout(r, 400));
      await cdp.send("Page.stopScreencast").catch(() => undefined);
      closed = true;
      await pending;
      if (frames.length < 2) throw new Error("the screencast produced fewer than two frames");
      const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? f.t + 0.6) - f.t).toFixed(4)}`);
      list.push(`file '${frames[frames.length - 1]!.file}'`);
      const listFile = path.join(o.workDir, "frames.txt");
      writeFileSync(listFile, `${list.join("\n")}\n`);
      mkdirSync(path.dirname(outFile), { recursive: true });
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-movflags", "+faststart", "-an", outFile]);
      const seconds = frames[frames.length - 1]!.t - frames[0]!.t;
      if (!o.keepFrames) rmSync(o.workDir, { recursive: true, force: true });
      return { frames: frames.length, seconds };
    },
  };
}
