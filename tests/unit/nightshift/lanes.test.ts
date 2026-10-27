import { describe, expect, it } from "vitest";
import { applyPins, classifyModel, emptyLane, isNvidiaId, pinLanes } from "../../../app/adapters/nightshift/lanes";
import { PINNED_MODELS } from "../../../app/schemas/models";
import { CATALOG } from "../../helpers/nightshift-mock";

describe("lane pinning (05 §4.5)", () => {
  it("pins the env ids when they are in the catalog (pin_source env)", () => {
    const pins = pinLanes(CATALOG, { fast: PINNED_MODELS.fast, deep: PINNED_MODELS.deep });
    expect(pins.fast).toEqual({ id: PINNED_MODELS.fast, source: "env" });
    expect(pins.deep).toEqual({ id: PINNED_MODELS.deep, source: "env" });
  });
  it("falls back to the Nemotron regex over nvidia/ ids only, deep tries /ultra/i first", () => {
    const pins = pinLanes(["meterless/fast", "anthropic/claude-haiku", "nvidia/nemotron-3-super-120b", "nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3.5-lightning-30b-a3b"], {});
    expect(pins.deep).toEqual({ id: "nvidia/nemotron-3-ultra-550b-a55b", source: "catalog_nemotron" });
    expect(pins.fast).toEqual({ id: "nvidia/nemotron-3.5-lightning-30b-a3b", source: "catalog_nemotron" });
  });
  it("never picks a meterless/* routing id or a non-NVIDIA id; a missing id leaves the lane unavailable", () => {
    const pins = pinLanes(["meterless/auto", "meterless/fast", "meterless/deep", "claude-lightning", "other/ultra"], {});
    expect(pins.fast.id).toBeNull();
    expect(pins.deep.id).toBeNull();
    const lanes = { fast: emptyLane(), deep: emptyLane() };
    applyPins(lanes, pins);
    expect(lanes.fast.state).toBe("unavailable");
  });
  it("refuses meterless/* even if it is set in the env", () => {
    const pins = pinLanes(CATALOG, { fast: "meterless/auto", deep: "meterless/deep" });
    expect(pins.fast.source).not.toBe("env");
    expect(pins.fast.id).toBe(PINNED_MODELS.fast);
    expect(isNvidiaId("meterless/auto")).toBe(false);
  });
  it("an env id that is absent from the catalog falls through to step 2", () => {
    const pins = pinLanes(CATALOG, { fast: "nvidia/nemotron-3.5-gone" });
    expect(pins.fast.source).toBe("catalog_nemotron");
  });
  it("keeps the env pin untested when the catalog cannot be read", () => {
    expect(pinLanes(null, { fast: PINNED_MODELS.fast }).fast).toEqual({ id: PINNED_MODELS.fast, source: "env" });
  });
  it("classifies the returned model", () => {
    expect(classifyModel("nvidia/nemotron-3.5-lightning-30b-a3b", true)).toBe("confirmed_nemotron");
    expect(classifyModel("meterless/auto", false)).toBe("routed_unconfirmed");
    expect(classifyModel(null, false)).toBe("routed_unconfirmed");
    expect(classifyModel("anthropic/claude-haiku", false)).toBe("non_nemotron");
  });
});
