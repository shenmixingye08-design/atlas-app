import { describe, expect, it } from "vitest";

import {
  AUTOMATION_MAX_ATTEMPTS,
  isFinalAutomationAttempt,
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

describe("automation retry policy", () => {
  it("retries until max attempts", () => {
    expect(AUTOMATION_MAX_ATTEMPTS).toBe(3);
    expect(shouldRetryAutomationAttempt(1, false)).toBe(true);
    expect(shouldRetryAutomationAttempt(2, false)).toBe(true);
    expect(shouldRetryAutomationAttempt(3, false)).toBe(false);
    expect(shouldRetryAutomationAttempt(1, true)).toBe(false);
    expect(isFinalAutomationAttempt(3)).toBe(true);
    expect(retryBackoffMs(1)).toBe(2_000);
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
        lastResultSummary: "完了 · 投稿URL: https://x.com/a/status/1",
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
  });
});
