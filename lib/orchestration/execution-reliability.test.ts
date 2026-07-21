import { describe, expect, it } from "vitest";

import {
  appendExecutionLog,
  ensureNotificationDelivery,
  formatFailureReason,
  getExecutionState,
  isRetryableFailure,
  listExecutionLogs,
  monitorTimeout,
  persistExecutionState,
} from "./execution-reliability";

describe("execution reliability", () => {
  it("persists execution state and appends logs", () => {
    const state = persistExecutionState({
      runId: "run_reliability_1",
      userId: "user_1",
      status: "running",
      attempt: 1,
      maxAttempts: 3,
      lastError: null,
      timedOut: false,
    });

    expect(getExecutionState("run_reliability_1", "user_1")?.status).toBe("running");
    expect(state.attempt).toBe(1);

    appendExecutionLog({
      runId: "run_reliability_1",
      userId: "user_1",
      level: "info",
      event: "unit_test",
      message: "log ok",
      attempt: 1,
    });

    const logs = listExecutionLogs({ runId: "run_reliability_1", userId: "user_1" });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((entry) => entry.event === "unit_test")).toBe(true);
  });

  it("classifies retryable failures and formats reasons", () => {
    expect(isRetryableFailure("Request timeout")).toBe(true);
    expect(isRetryableFailure("Cancelled by user")).toBe(false);
    expect(formatFailureReason("timeout while waiting")).toContain("時間内");
    expect(formatFailureReason("sk-abc123 failed")).not.toContain("sk-");
  });

  it("monitors timeout budgets", () => {
    const ok = monitorTimeout({
      startedAtMs: 1000,
      budgetMs: 5000,
      nowMs: 2000,
    });
    expect(ok.timedOut).toBe(false);
    expect(ok.remainingMs).toBe(4000);

    const overdue = monitorTimeout({
      startedAtMs: 1000,
      budgetMs: 5000,
      nowMs: 7000,
    });
    expect(overdue.timedOut).toBe(true);
  });

  it("guarantees notification delivery with retries", () => {
    let calls = 0;
    const record = ensureNotificationDelivery(
      () => {
        calls += 1;
        if (calls < 2) throw new Error("transient");
        return { id: "ntf_ok" };
      },
      { runId: "run_reliability_2", userId: "user_2", kind: "completed" },
    );

    expect(record).toEqual({ id: "ntf_ok" });
    expect(calls).toBe(2);
  });
});
