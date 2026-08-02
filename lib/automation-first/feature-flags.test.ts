import { afterEach, describe, expect, it } from "vitest";

import {
  buildFeatureAccessContext,
  buildFeatureAvailabilityMap,
  isFeatureEnabled,
} from "@/lib/feature-flags/access";
import {
  getFeatureFlagState,
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import { FEATURE_FLAG_IDS } from "@/lib/feature-flags/registry";

describe("automation first feature flags", () => {
  afterEach(() => {
    resetFeatureFlagStore();
  });

  it("registers all four Automation First flags", () => {
    expect(FEATURE_FLAG_IDS).toContain("automation_first_home_enabled");
    expect(FEATURE_FLAG_IDS).toContain("automation_first_navigation_enabled");
    expect(FEATURE_FLAG_IDS).toContain("automation_design_system_enabled");
    expect(FEATURE_FLAG_IDS).toContain("automation_dashboard_v2_enabled");
    expect(FEATURE_FLAG_IDS).toContain("automation_operations_enabled");
  });

  it("defaults Automation First flags to off", () => {
    expect(getFeatureFlagState("automation_first_home_enabled")).toBe("off");
    expect(getFeatureFlagState("automation_first_navigation_enabled")).toBe("off");
    expect(getFeatureFlagState("automation_design_system_enabled")).toBe("off");
    expect(getFeatureFlagState("automation_dashboard_v2_enabled")).toBe("off");
    expect(getFeatureFlagState("automation_operations_enabled")).toBe("off");
  });

  it("keeps legacy home when flags are off", () => {
    const context = buildFeatureAccessContext("user@example.com");
    expect(isFeatureEnabled("automation_first_home_enabled", context)).toBe(false);
    const map = buildFeatureAvailabilityMap(context);
    expect(map.automation_first_home_enabled).toBe(false);
  });

  it("enables home when flag is on", () => {
    setFeatureFlagState("automation_first_home_enabled", "on");
    const context = buildFeatureAccessContext("user@example.com");
    expect(isFeatureEnabled("automation_first_home_enabled", context)).toBe(true);
  });
});
