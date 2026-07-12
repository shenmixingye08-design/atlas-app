import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildCancellationAnalysisSnapshot } from "./engine";
import {
  recordCancellationEvent,
  resetCancellationAnalysisStore,
} from "./store";

describe("cancellation analysis engine", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");

  beforeEach(() => {
    resetCancellationAnalysisStore();
  });

  afterEach(() => {
    resetCancellationAnalysisStore();
  });

  it("returns empty metrics when no live data exists", () => {
    const snapshot = buildCancellationAnalysisSnapshot(now);

    expect(snapshot.canceledCount).toBe(0);
    expect(snapshot.churnRatePercent).toBeNull();
    expect(snapshot.reasons).toHaveLength(4);
    expect(snapshot.reasons.every((row) => row.count === 0)).toBe(true);
    expect(snapshot.isEstimated).toBe(false);
  });

  it("aggregates live cancellations and reason breakdown", () => {
    recordCancellationEvent({
      userId: "user_a",
      planId: "standard",
      reasonId: "price",
      timestamp: "2026-07-08T10:00:00.000Z",
    });
    recordCancellationEvent({
      userId: "user_b",
      planId: "light",
      reasonId: "not_used",
      timestamp: "2026-07-07T10:00:00.000Z",
    });
    recordCancellationEvent({
      userId: "user_c",
      planId: "premium",
      reasonId: "price",
      timestamp: "2026-07-06T10:00:00.000Z",
    });

    const snapshot = buildCancellationAnalysisSnapshot(now);
    const price = snapshot.reasons.find((entry) => entry.reasonId === "price");
    const notUsed = snapshot.reasons.find(
      (entry) => entry.reasonId === "not_used",
    );

    expect(snapshot.canceledCount).toBe(3);
    expect(snapshot.isEstimated).toBe(false);
    expect(price?.count).toBe(2);
    expect(notUsed?.count).toBe(1);
    expect(price?.sharePercent).toBe(67);
  });

  it("computes month-over-month change against previous month", () => {
    recordCancellationEvent({
      userId: "user_a",
      planId: "standard",
      reasonId: "other",
      timestamp: "2026-07-05T10:00:00.000Z",
    });
    recordCancellationEvent({
      userId: "user_b",
      planId: "light",
      reasonId: "other",
      timestamp: "2026-07-06T10:00:00.000Z",
    });
    recordCancellationEvent({
      userId: "user_c",
      planId: "premium",
      reasonId: "price",
      timestamp: "2026-06-20T10:00:00.000Z",
    });

    const snapshot = buildCancellationAnalysisSnapshot(now);

    expect(snapshot.canceledCount).toBe(2);
    expect(snapshot.momChangePercent).toBe(100);
  });
});
