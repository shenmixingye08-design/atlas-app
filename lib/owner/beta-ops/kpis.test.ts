import { describe, expect, it, beforeEach } from "vitest";

import {
  getBetaOpsSnapshot,
  recordBetaOpsEvent,
  resetBetaOpsEventsForTests,
  resetBetaImprovementLogForTests,
} from "@/lib/owner/beta-ops";

describe("beta ops KPIs", () => {
  beforeEach(() => {
    resetBetaOpsEventsForTests();
    resetBetaImprovementLogForTests();
  });

  it("computes completion and failure rates for today", () => {
    recordBetaOpsEvent({
      kind: "request",
      userId: "u1",
      jobId: "j1",
      assignment: "この写真を資料にして",
    });
    recordBetaOpsEvent({
      kind: "complete",
      userId: "u1",
      jobId: "j1",
      durationMs: 42_000,
      assignment: "この写真を資料にして",
    });
    recordBetaOpsEvent({
      kind: "request",
      userId: "u2",
      jobId: "j2",
      assignment: "別の仕事",
    });
    recordBetaOpsEvent({
      kind: "fail",
      userId: "u2",
      jobId: "j2",
      durationMs: 10_000,
      assignment: "別の仕事",
    });

    const snap = getBetaOpsSnapshot();
    expect(snap.inviteOnly).toBe(true);
    expect(snap.periods.today.requestCount).toBe(2);
    expect(snap.periods.today.completionRatePercent).toBe(50);
    expect(snap.periods.today.failureRatePercent).toBe(50);
    expect(snap.periods.today.avgCompletionSeconds).toBe(42);
    expect(snap.channels.bugReportUrl).toContain("category=bug");
  });
});
