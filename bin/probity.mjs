#!/usr/bin/env node
// probity CLI entry: registers tsx so the .ts sources run unchanged (no build step), then hands over to app/cli/main.ts.
import { register } from "tsx/esm/api";

register();
await import("../app/cli/main.ts");
