import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildFeatureAccessContext,
  buildFeatureAvailabilityMap,
  isFeatureEnabled,
} from "./access";
import {
  isOrchestrationFeatureEnabled,
  resolveOrchestrationFeatureFlag,
  validateAutomationFeatureAccess,
} from "./guards";
import { resetFeatureFlagStore, setFeatureFlagState } from "./store";
import { parseFeatureFlagUpdateBody, updateFeatureFlagState } from "./service";

describe("feature flag store and service", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
  });

  it("defaults all flags to on", () => {
    const snapshot = updateFeatureFlagState("google", "on");
    expect(snapshot.flags).toHaveLength(11);
    expect(snapshot.flags.every((flag) => flag.state === "on")).toBe(true);
  });

  it("updates a single flag state", () => {
    const snapshot = updateFeatureFlagState("sns", "beta");
    const sns = snapshot.flags.find((flag) => flag.id === "sns");
    expect(sns?.state).toBe("beta");
  });

  it("validates patch body", () => {
    expect(parseFeatureFlagUpdateBody({ id: "blog", state: "off" })).toEqual({
      id: "blog",
      state: "off",
    });
    expect(parseFeatureFlagUpdateBody({ id: "unknown", state: "on" })).toEqual({
      error: "id is invalid",
    });
  });
});

describe("feature flag access", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows beta users and owners when state is beta", () => {
    setFeatureFlagState("google", "beta");
    vi.stubEnv("ATLAS_BETA_USER_EMAILS", "beta@example.com");
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@example.com");

    const betaContext = buildFeatureAccessContext("beta@example.com");
    const ownerContext = buildFeatureAccessContext("owner@example.com");
    const regularContext = buildFeatureAccessContext("user@example.com");

    expect(isFeatureEnabled("google", betaContext)).toBe(true);
    expect(isFeatureEnabled("google", ownerContext)).toBe(true);
    expect(isFeatureEnabled("google", regularContext)).toBe(false);
  });

  it("builds availability map for regular users", () => {
    setFeatureFlagState("blog", "off");
    setFeatureFlagState("sns", "beta");

    const map = buildFeatureAvailabilityMap(
      buildFeatureAccessContext("user@example.com"),
    );

    expect(map.blog).toBe(false);
    expect(map.sns).toBe(false);
    expect(map.google).toBe(true);
  });
});

describe("feature flag guards", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
  });

  it("classifies orchestration requests", () => {
    expect(
      resolveOrchestrationFeatureFlag({ assignment: "営業資料を作って" }),
    ).toBe("sales_material");
    expect(
      resolveOrchestrationFeatureFlag({ assignment: "ブログ記事を書いて" }),
    ).toBe("blog");
    expect(
      resolveOrchestrationFeatureFlag({ assignment: "SNS投稿文を作成" }),
    ).toBe("sns");
  });

  it("blocks orchestration when feature is off", () => {
    setFeatureFlagState("blog", "off");
    const context = buildFeatureAccessContext("user@example.com");

    expect(
      isOrchestrationFeatureEnabled(
        { assignment: "ブログ記事を書いて" },
        context,
      ),
    ).toBe(false);
  });

  it("blocks high quality automation mode when disabled", () => {
    setFeatureFlagState("high_quality_mode", "off");
    const context = buildFeatureAccessContext("user@example.com");

    expect(
      validateAutomationFeatureAccess(
        { executionMode: "high_quality" },
        context,
      ),
    ).toContain("高品質モード");
  });
});
