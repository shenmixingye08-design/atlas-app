import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildCostRankingSnapshot } from "./engine";
import { recordCostUsage, resetCostRankingStore } from "./store";

describe("cost ranking engine", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");

  beforeEach(() => {
    resetCostRankingStore();
  });

  afterEach(() => {
    resetCostRankingStore();
  });

  it("returns estimated metrics when no live data exists", () => {
    const snapshot = buildCostRankingSnapshot(now);

    expect(snapshot.rankings).toHaveLength(8);
    expect(snapshot.rankings[0]?.rank).toBe(1);
    expect(snapshot.rankings[0]?.apiCostUsd).toBeGreaterThan(0);
    expect(snapshot.rankings[0]?.isEstimated).toBe(true);
    expect(snapshot.totalApiCostUsd).toBeGreaterThan(0);
  });

  it("aggregates live cost and ranks by API cost descending", () => {
    recordCostUsage({
      featureId: "sns",
      userId: "user_a",
      costUsd: 0.12,
      durationMs: 60_000,
      timestamp: "2026-07-08T10:00:00.000Z",
    });
    recordCostUsage({
      featureId: "sns",
      userId: "user_b",
      costUsd: 0.08,
      durationMs: 40_000,
      timestamp: "2026-07-07T10:00:00.000Z",
    });
    recordCostUsage({
      featureId: "blog",
      userId: "user_a",
      costUsd: 0.05,
      durationMs: 90_000,
      timestamp: "2026-07-06T10:00:00.000Z",
    });

    const snapshot = buildCostRankingSnapshot(now);
    const sns = snapshot.rankings.find((entry) => entry.featureId === "sns");
    const blog = snapshot.rankings.find((entry) => entry.featureId === "blog");

    expect(sns?.apiCostUsd).toBe(0.2);
    expect(sns?.avgUsageTimeMs).toBe(50_000);
    expect(sns?.usageCount).toBe(2);
    expect(sns?.isEstimated).toBe(false);
    expect(sns?.rank).toBe(1);
    expect(blog?.apiCostUsd).toBe(0.05);
    expect(blog?.rank).toBe(2);
    expect(snapshot.totalApiCostUsd).toBe(0.25);
  });

  it("flags high cost features with warning levels", () => {
    recordCostUsage({
      featureId: "video",
      userId: "user_a",
      costUsd: 0.8,
      durationMs: 180_000,
      timestamp: "2026-07-08T10:00:00.000Z",
    });
    recordCostUsage({
      featureId: "blog",
      userId: "user_b",
      costUsd: 0.1,
      durationMs: 90_000,
      timestamp: "2026-07-08T11:00:00.000Z",
    });

    const snapshot = buildCostRankingSnapshot(now);
    const video = snapshot.rankings.find((entry) => entry.featureId === "video");

    expect(video?.costRatioPercent).toBeGreaterThanOrEqual(25);
    expect(video?.warningLevel).toBe("critical");
  });
});
