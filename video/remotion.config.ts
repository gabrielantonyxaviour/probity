import { Config } from "@remotion/cli/config";
import { existsSync } from "node:fs";

Config.setVideoImageFormat("png"); // png frames keep the mp4 in yuv420p (jpeg frames come out yuvj420p)
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
// The Remotion CDN is not reachable from every network. Point REMOTION_BROWSER_EXECUTABLE at a chrome-headless-shell.
const exe = process.env.REMOTION_BROWSER_EXECUTABLE;
if (exe && existsSync(exe)) Config.setBrowserExecutable(exe);
