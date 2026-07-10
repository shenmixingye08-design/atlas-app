import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isAtlasOwnerEmail,
  parseAtlasOwnerEmails,
} from "@/lib/auth/is-atlas-owner";
import { getOwnerDashboardSnapshot } from "@/lib/owner/service";

describe("isAtlasOwnerEmail", () => {
  beforeEach(() => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test, admin@atlas.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses owner emails from env", () => {
    expect(parseAtlasOwnerEmails()).toEqual([
      "owner@atlas.test",
      "admin@atlas.test",
    ]);
  });

  it("matches owner emails case-insensitively", () => {
    expect(isAtlasOwnerEmail("Owner@Atlas.test")).toBe(true);
    expect(isAtlasOwnerEmail("user@example.com")).toBe(false);
    expect(isAtlasOwnerEmail(null)).toBe(false);
  });

  it("denies everyone when env is empty", () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "");
    expect(isAtlasOwnerEmail("owner@atlas.test")).toBe(false);
  });
});

describe("owner dashboard snapshot", () => {
  it("returns mock metrics with required sections", async () => {
    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-07-01"));

    expect(snapshot.revenue.amountUsd).toBeGreaterThan(0);
    expect(snapshot.users.paid).toBeGreaterThan(0);
    expect(snapshot.billing.mrrJpy).toBeGreaterThan(0);
    expect(snapshot.billing.planBreakdown.length).toBe(3);
    expect(snapshot.popularFeatures.length).toBeGreaterThan(0);
    expect(snapshot.highCostUsers.length).toBeGreaterThan(0);
    expect(snapshot.nextStripePayout.amountUsd).toBeGreaterThan(0);
    expect(snapshot.dataSources.some((source) => source.id === "stripe")).toBe(
      true,
    );
  });
});
