import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setFeatureFlagState, resetFeatureFlagStore } from "@/lib/feature-flags/store";

import { buildBetaUserManagementSnapshot } from "./engine";
import {
  addRuntimeBetaUserEmail,
  resetBetaUserStore,
} from "./emails";

describe("beta user management engine", () => {
  beforeEach(() => {
    resetBetaUserStore();
    resetFeatureFlagStore();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetBetaUserStore();
    resetFeatureFlagStore();
    vi.unstubAllEnvs();
  });

  it("returns live beta counts without estimated fillers", () => {
    const snapshot = buildBetaUserManagementSnapshot(
      new Date("2026-07-08T12:00:00.000Z"),
    );

    expect(snapshot.isEstimated).toBe(false);
    expect(snapshot.betaParticipantCount).toBe(0);
    expect(snapshot.totalUserCount).toBeGreaterThanOrEqual(0);
  });

  it("lists beta features from feature flag store", () => {
    setFeatureFlagState("sns", "beta");
    setFeatureFlagState("google", "beta");

    const snapshot = buildBetaUserManagementSnapshot();
    const ids = snapshot.betaFeatures.map((entry) => entry.featureId);

    expect(ids).toContain("sns");
    expect(ids).toContain("google");
    expect(ids).not.toContain("blog");
  });

  it("counts runtime beta users and computes participation rate", () => {
    vi.stubEnv("ATLAS_BETA_USER_EMAILS", "beta@example.com");
    addRuntimeBetaUserEmail("extra@example.com");

    const snapshot = buildBetaUserManagementSnapshot();

    expect(snapshot.betaParticipantCount).toBe(2);
    expect(snapshot.betaUsers).toHaveLength(2);
    expect(snapshot.isEstimated).toBe(false);
    // Rate is null when subscription store has no users (no invented denominator).
    expect(snapshot.participationRatePercent).toBeNull();
  });
});
