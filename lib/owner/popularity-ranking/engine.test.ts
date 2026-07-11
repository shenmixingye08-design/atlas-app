import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildPopularityRankingSnapshot } from "./engine";
import {
  recordPopularityUsage,
  resetPopularityRankingStore,
} from "./store";

describe("popularity ranking engine", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");

  beforeEach(() => {
    resetPopularityRankingStore();
  });

  afterEach(() => {
    resetPopularityRankingStore();
  });

  it("returns zero metrics when no live data exists", () => {
    const snapshot = buildPopularityRankingSnapshot(now);
    expect(snapshot.rankings).toHaveLength(8);
    expect(snapshot.rankings[0]?.rank).toBe(1);
    expect(snapshot.rankings.every((row) => row.usageCount === 0)).toBe(true);
    expect(snapshot.rankings.every((row) => row.isEstimated === false)).toBe(
      true,
    );
  });

  it("aggregates live usage and ranks by usage count", () => {
    recordPopularityUsage({
      featureId: "sns",
      userId: "user_a",
      timestamp: "2026-07-08T10:00:00.000Z",
    });
    recordPopularityUsage({
      featureId: "sns",
      userId: "user_b",
      timestamp: "2026-07-07T10:00:00.000Z",
    });
    recordPopularityUsage({
      featureId: "blog",
      userId: "user_a",
      timestamp: "2026-07-06T10:00:00.000Z",
    });

    const snapshot = buildPopularityRankingSnapshot(now);
    const sns = snapshot.rankings.find((entry) => entry.featureId === "sns");
    const blog = snapshot.rankings.find((entry) => entry.featureId === "blog");

    expect(sns?.usageCount).toBe(2);
    expect(sns?.activeUsers).toBe(2);
    expect(sns?.isEstimated).toBe(false);
    expect(sns?.rank).toBe(1);
    expect(blog?.usageCount).toBe(1);
  });

  it("computes month-over-month change against previous month", () => {
    recordPopularityUsage({
      featureId: "email",
      userId: "user_a",
      timestamp: "2026-07-05T10:00:00.000Z",
    });
    recordPopularityUsage({
      featureId: "email",
      userId: "user_a",
      timestamp: "2026-07-06T10:00:00.000Z",
    });
    recordPopularityUsage({
      featureId: "email",
      userId: "user_b",
      timestamp: "2026-06-20T10:00:00.000Z",
    });

    const snapshot = buildPopularityRankingSnapshot(now);
    const email = snapshot.rankings.find((entry) => entry.featureId === "email");

    expect(email?.usageCount).toBe(2);
    expect(email?.momChangePercent).toBe(100);
  });
});
