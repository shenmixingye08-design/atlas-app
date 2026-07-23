import { describe, expect, it } from "vitest";

import { detectRecurringIntent } from "./detect-recurring";
import { getTodaysAutomations } from "./today";
import type { Automation } from "./types";
import { DEFAULT_AUTOMATION_TIMING } from "./timing-defaults";
import { createDefaultExecutionFlow } from "./execution-flow";

function mockAutomation(partial: Partial<Automation>): Automation {
  return {
    id: "test",
    userId: null,
    name: "テスト",
    description: "desc",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 9:00",
    },
    workflow: { assignment: "test" },
    timing: DEFAULT_AUTOMATION_TIMING,
    executionLevel: "approve_then_run",
    executionMode: "eco",
    snsBatchDays: null,
    executionFlow: createDefaultExecutionFlow(),
    enabled: true,
    lastRun: null,
    nextRun: null,
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    lastResultSummary: null,
    currentAttempt: 0,
    nextRetryAt: null,
    activeSlotKey: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("detectRecurringIntent", () => {
  it("detects weekly blog phrasing", () => {
    const result = detectRecurringIntent("毎週ブログを書いて");
    expect(result.detected).toBe(true);
    if (result.detected) {
      expect(result.suggestionMessage).toContain("定期業務");
      expect(result.formDefaults.title).toBe("ブログ作成");
    }
  });

  it("detects daily posting with time", () => {
    const result = detectRecurringIntent("毎日18時に投稿して");
    expect(result.detected).toBe(true);
    if (result.detected) {
      expect(result.formDefaults.frequency).toBe("daily");
      expect(result.formDefaults.hour).toBe(18);
    }
  });

  it("ignores non-recurring requests", () => {
    expect(detectRecurringIntent("ブログ記事を1本書いて").detected).toBe(false);
  });
});

describe("getTodaysAutomations", () => {
  it("includes daily automations every day", () => {
    const items = getTodaysAutomations([
      mockAutomation({ id: "daily", name: "毎日タスク" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.automation.name).toBe("毎日タスク");
  });
});
