import { beforeEach, describe, expect, it } from "vitest";

import {
  listBetaOpsEvents,
  recordBetaOpsEvent,
  resetBetaOpsEventsForTests,
} from "@/lib/owner/beta-ops";
import {
  computeReferralFirstCompletionRate,
  countWeeklyCompletingUsers,
  getGrowthOsSnapshot,
} from "@/lib/owner/growth-os";

describe("growth os metrics", () => {
  beforeEach(() => {
    resetBetaOpsEventsForTests();
  });

  it("counts unique weekly completing users", () => {
    const now = new Date();
    recordBetaOpsEvent({
      kind: "complete",
      userId: "a",
      jobId: "1",
      durationMs: 1000,
    });
    recordBetaOpsEvent({
      kind: "complete",
      userId: "a",
      jobId: "2",
      durationMs: 1000,
    });
    recordBetaOpsEvent({
      kind: "complete",
      userId: "b",
      jobId: "3",
      durationMs: 1000,
    });

    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(countWeeklyCompletingUsers(listBetaOpsEvents(), from, now)).toBe(2);
  });

  it("computes referral first-completion rate with user link", () => {
    recordBetaOpsEvent({ kind: "referral", userId: "newbie" });
    recordBetaOpsEvent({
      kind: "complete",
      userId: "newbie",
      jobId: "j1",
      durationMs: 5000,
    });
    recordBetaOpsEvent({
      kind: "complete",
      userId: "organic",
      jobId: "j2",
      durationMs: 5000,
    });

    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const result = computeReferralFirstCompletionRate(
      listBetaOpsEvents(),
      from,
      now
    );
    expect(result.sampleSize).toBe(2);
    expect(result.rate).toBe(50);
  });

  it("exposes exactly three CEO metrics", () => {
    const snap = getGrowthOsSnapshot();
    expect(snap.metrics).toHaveLength(3);
    expect(snap.metrics.map((m) => m.id)).toEqual([
      "weeklyCompletingUsers",
      "referralFirstCompletionRate",
      "paidUsers",
    ]);
  });
});
