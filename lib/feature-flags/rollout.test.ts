import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAutomationFirstRolloutFlag,
  resolveAutomationFirstDefaultState,
} from "@/lib/feature-flags/rollout";
import { resolveClientAutomationFirstPreferOn } from "@/lib/feature-flags/client-rollout";

describe("automation first rollout defaults", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("marks formal-home flags as rollout members", () => {
    expect(isAutomationFirstRolloutFlag("automation_first_home_enabled")).toBe(
      true,
    );
    expect(
      isAutomationFirstRolloutFlag("automation_first_navigation_enabled"),
    ).toBe(true);
    expect(
      isAutomationFirstRolloutFlag("automation_design_system_enabled"),
    ).toBe(true);
    expect(
      isAutomationFirstRolloutFlag("automation_dashboard_v2_enabled"),
    ).toBe(true);
  });

  it("defaults to on for Vercel Preview", () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ATLAS_AUTOMATION_FIRST_UI", "");
    expect(resolveAutomationFirstDefaultState()).toBe("on");
  });

  it("defaults to beta in production (rollback-friendly staged)", () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATLAS_AUTOMATION_FIRST_UI", "");
    expect(resolveAutomationFirstDefaultState()).toBe("beta");
  });

  it("honors ATLAS_AUTOMATION_FIRST_UI=off for rollback", () => {
    vi.stubEnv("ATLAS_AUTOMATION_FIRST_UI", "off");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(resolveAutomationFirstDefaultState()).toBe("off");
  });

  it("client prefers AF on for Preview/dev", () => {
    vi.stubEnv("NEXT_PUBLIC_ATLAS_AUTOMATION_FIRST_UI", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveClientAutomationFirstPreferOn()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveClientAutomationFirstPreferOn()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_ATLAS_AUTOMATION_FIRST_UI", "off");
    expect(resolveClientAutomationFirstPreferOn()).toBe(false);
  });
});
