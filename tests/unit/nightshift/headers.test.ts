import { describe, expect, it } from "vitest";
import { appIdFor, headersFor } from "../../../app/adapters/nightshift/request";

describe("Nightshift headers (05 §4.3, REV-57)", () => {
  it("chat calls carry a per-call lower-case app id <= 48 chars, an app-scoped memory and trace 1", () => {
    const h = headersFor("tok-123456789", appIdFor("probity", "r-20261027T140211Z-9f2c", 3));
    expect(h["meterless-app"]).toBe("probity-r-20261027t140211z-9f2c-3");
    expect(h["meterless-scope"]).toBe("app"); // live finding: scope user injects earlier answers across app ids
    expect(headersFor("tok-123456789", "probity-x-1", "user")["meterless-scope"]).toBe("user");
    expect(h["meterless-trace"]).toBe("1");
    expect(h["content-type"]).toBe("application/json");
    expect(h.authorization).toBe("Bearer tok-123456789");
  });
  it("warm-up ids are probity-warmup-<UTC>-<n>", () => {
    expect(appIdFor("probity", "warmup-20261027t122939z", 2)).toBe("probity-warmup-20261027t122939z-2");
  });
  it("slugs odd characters and never exceeds 48 characters, keeping the call counter", () => {
    for (const run of ["R_Weird.Run ID!!", "x".repeat(200), "r-a--b"]) {
      const id = appIdFor("probity", run, 17);
      expect(id).toMatch(/^[a-z0-9-]{1,48}$/);
      expect(id.endsWith("-17")).toBe(true);
      expect(id).not.toMatch(/--/);
    }
  });
  it("different calls never share an app id (Nightshift injects memory per app id)", () => {
    const ids = new Set(Array.from({ length: 30 }, (_v, n) => appIdFor("probity", "r-1-aaaa", n + 1)));
    expect(ids.size).toBe(30);
  });
});
