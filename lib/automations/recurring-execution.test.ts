import { describe, expect, it } from "vitest";

import {
  AUTOMATION_MAX_ATTEMPTS,
  AUTOMATION_MAX_RETRIES,
  formatRetryDelay,
  isFinalAutomationAttempt,
  nextRetryAtIso,
  retryBackoffMs,
  shouldRetryAutomationAttempt,
} from "./retry-policy";
import {
  describeLastRunResult,
  formatDurationMs,
  resolveAutomationExecutionState,
} from "./execution-status";
import {
  applyExternalPublishIntent,
  createDefaultExecutionFlow,
  hasPublishIntent,
} from "./execution-flow";
import { normalizeRunHistoryEntry } from "./normalize-run-history";
import {
  computeNextRunAfterSuccessIso,
  isAutomationDue,
  isOneShotSchedule,
} from "./schedule";

describe("automation retry policy", () => {
  it("supports 3 deferred retries (4 total attempts)", () => {
    expect(AUTOMATION_MAX_RETRIES).toBe(3);
    expect(AUTOMATION_MAX_ATTEMPTS).toBe(4);
    expect(shouldRetryAutomationAttempt(1, false)).toBe(true);
    expect(shouldRetryAutomationAttempt(2, false)).toBe(true);
    expect(shouldRetryAutomationAttempt(3, false)).toBe(true);
    expect(shouldRetryAutomationAttempt(4, false)).toBe(false);
    expect(shouldRetryAutomationAttempt(1, true)).toBe(false);
    expect(isFinalAutomationAttempt(4)).toBe(true);
    expect(retryBackoffMs(1)).toBe(30_000);
    expect(retryBackoffMs(2)).toBe(300_000);
    expect(retryBackoffMs(3)).toBe(1_800_000);
    expect(formatRetryDelay(1)).toContain("秒");
    const from = new Date("2026-07-23T00:00:00.000Z");
    expect(nextRetryAtIso(1, from)).toBe("2026-07-23T00:00:30.000Z");
  });
});

describe("automation execution status", () => {
  it("maps durable statuses", () => {
    expect(
      resolveAutomationExecutionState({ enabled: true, status: "idle" }),
    ).toBe("waiting");
    expect(
      resolveAutomationExecutionState({ enabled: true, status: "running" }),
    ).toBe("running");
    expect(
      resolveAutomationExecutionState({ enabled: true, status: "retrying" }),
    ).toBe("retrying");
    expect(
      resolveAutomationExecutionState({ enabled: true, status: "success" }),
    ).toBe("completed");
    expect(
      resolveAutomationExecutionState({ enabled: true, status: "failed" }),
    ).toBe("failed");
  });

  it("formats duration and last result", () => {
    expect(formatDurationMs(1500)).toBe("1.5秒");
    expect(
      describeLastRunResult({
        status: "success",
        lastError: null,
        lastResultSummary: "成功 · 投稿URL: https://x.com/a/status/1",
        runHistory: [],
      }),
    ).toContain("投稿URL");
  });
});

describe("SNS publish intent for recurring work", () => {
  it("enables publish step when assignment asks to post", () => {
    expect(hasPublishIntent("Xに投稿してください")).toBe(true);
    expect(hasPublishIntent("投稿文案の下書きだけ作成")).toBe(false);

    const flow = applyExternalPublishIntent(
      createDefaultExecutionFlow("sns_post"),
      "毎日Xへ投稿する",
    );
    expect(flow.steps.find((s) => s.id === "publish")?.enabled).toBe(true);
  });
});

describe("normalize run history", () => {
  it("fills defaults for legacy rows", () => {
    const entry = normalizeRunHistoryEntry({
      id: "r1",
      status: "completed",
      startedAt: "2026-07-23T00:00:00.000Z",
      completedAt: "2026-07-23T00:00:02.000Z",
      error: null,
      triggerType: "automation",
    });
    expect(entry?.durationMs).toBe(2000);
    expect(entry?.attempt).toBe(1);
    expect(entry?.actions).toEqual([]);
    expect(entry?.generatedContent).toBeNull();
  });
});

describe("one-shot schedule", () => {
  it("fires once and has no next run after success", () => {
    const schedule = {
      kind: "schedule" as const,
      preset: { type: "once" as const, at: "2026-08-01T01:00:00.000Z" },
      timezone: "Asia/Tokyo",
      label: "指定日時",
    };
    expect(isOneShotSchedule(schedule)).toBe(true);
    expect(computeNextRunAfterSuccessIso(schedule)).toBeNull();
    expect(
      isAutomationDue({
        enabled: true,
        nextRun: "2020-01-01T00:00:00.000Z",
        status: "idle",
      }),
    ).toBe(true);
    expect(
      isAutomationDue({
        enabled: true,
        nextRun: "2099-01-01T00:00:00.000Z",
        status: "idle",
        nextRetryAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      isAutomationDue({
        enabled: true,
        nextRun: "2099-01-01T00:00:00.000Z",
        status: "retrying",
        nextRetryAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toBe(true);
  });
});
