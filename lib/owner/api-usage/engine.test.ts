import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildApiUsageMonitoringSnapshot,
  buildProviderSnapshot,
} from "./engine";
import { recordApiUsage, resetApiUsageStore, setProviderBudgetUsd } from "./store";

describe("api usage engine", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");

  beforeEach(() => {
    resetApiUsageStore();
  });

  afterEach(() => {
    resetApiUsageStore();
  });

  it("aggregates today and month usage from recorded events", () => {
    recordApiUsage({
      providerId: "openai",
      amountUsd: 1.25,
      timestamp: "2026-07-08T09:00:00.000Z",
      source: "orchestration",
    });
    recordApiUsage({
      providerId: "openai",
      amountUsd: 2.5,
      timestamp: "2026-07-03T09:00:00.000Z",
      source: "automation",
    });

    const snapshot = buildProviderSnapshot("openai", now);

    expect(snapshot.todayUsd).toBe(1.25);
    expect(snapshot.monthUsd).toBe(3.75);
    expect(snapshot.isEstimated).toBe(false);
  });

  it("warns when monthly usage exceeds budget", () => {
    setProviderBudgetUsd("google", 10);
    recordApiUsage({
      providerId: "google",
      amountUsd: 12,
      timestamp: "2026-07-08T09:00:00.000Z",
    });

    const snapshot = buildApiUsageMonitoringSnapshot(now);
    const google = snapshot.providers.find((provider) => provider.providerId === "google");

    expect(google?.warningLevel).toBe("critical");
    expect(google?.remainingUsd).toBe(0);
    expect(snapshot.warnings.some((warning) => warning.providerId === "google")).toBe(
      true,
    );
  });

  it("warns when projected usage approaches budget", () => {
    setProviderBudgetUsd("stripe", 100);
    recordApiUsage({
      providerId: "stripe",
      amountUsd: 85,
      timestamp: "2026-07-08T09:00:00.000Z",
    });

    const snapshot = buildProviderSnapshot("stripe", now);

    expect(snapshot.warningLevel).toBe("approaching");
  });

  it("returns estimated values when no live records exist", () => {
    const snapshot = buildProviderSnapshot("x", now);

    expect(snapshot.isEstimated).toBe(true);
    expect(snapshot.monthUsd).toBeGreaterThan(0);
    expect(snapshot.todayUsd).toBeGreaterThan(0);
  });
});
