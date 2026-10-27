// Browser logger (no console.* in production code). pino's browser build writes through the console internally.
import pino from "pino";

export const log = pino({
  name: "probity-ui",
  level: process.env.NODE_ENV === "production" ? "warn" : "debug",
  browser: { asObject: true },
});
