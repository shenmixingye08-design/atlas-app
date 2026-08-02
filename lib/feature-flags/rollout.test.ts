import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAutomationFirstRolloutFlag,
  resolveAutomationFirstDefaultState,
} from "./rollout";
import { resetFeatureFlagStore, getFeatureFlagState } from "./store";

describe("automation first rollout defaults", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetFeatureFlagStore();
  });

  it("identifies rollout flags", () => {
    expect(isAutomationFirstRolloutFlag("automation_first_home_enabled")).toBe(
      true,
    );
    expect(isAutomationFirstRolloutFlag("automation_memory_enabled")).toBe(
      false,
    );
  });

  it("keeps test defaults off for deterministic unit tests", () => {
    expect(resolveAutomationFirstDefaultState()).toBe("off");
    expect(getFeatureFlagState("automation_first_home_enabled")).toBe("off");
  });

  it("turns on for Preview via env override", () => {
    vi.stubEnv("ATLAS_AUTOMATION_FIRST_UI", "on");
    expect(resolveAutomationFirstDefaultState()).toBe("on");
  });

  it("supports beta staged production default via override", () => {
    vi.stubEnv("ATLAS_AUTOMATION_FIRST_UI", "beta");
    expect(resolveAutomationFirstDefaultState()).toBe("beta");
  });

  it("supports explicit off override", () => {
    vi.stubEnv("ATLAS_AUTOMATION_FIRST_UI", "off");
    expect(resolveAutomationFirstDefaultState()).toBe("off");
  });
});
