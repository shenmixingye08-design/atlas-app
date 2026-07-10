import { describe, expect, it } from "vitest";

import {
  clampConfirmationLevel,
  resolveEntrustedJobStatus,
  resolveScheduleMethod,
  summarizeEntrustedJobs,
} from "./display";
import type { Automation, WorkExecutionFlow } from "./types";

function baseAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    name: "テスト",
    description: "説明",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 09:00",
    },
    workflow: { assignment: "投稿する" },
    timing: {
      startDate: null,
      endCondition: { type: "never" },
    },
    executionLevel: "approve_then_run",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: {
      templateId: "generic",
      steps: [{ id: "plan", enabled: true }],
    },
    enabled: true,
    lastRun: null,
    nextRun: null,
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("entrusted job display helpers", () => {
  it("maps statuses from real automation fields", () => {
    expect(resolveEntrustedJobStatus(baseAutomation({ enabled: false }))).toBe(
      "paused",
    );
    expect(
      resolveEntrustedJobStatus(baseAutomation({ status: "running" })),
    ).toBe("running");
    expect(
      resolveEntrustedJobStatus(baseAutomation({ status: "failed" })),
    ).toBe("error");
    expect(
      resolveEntrustedJobStatus(baseAutomation({ status: "success" })),
    ).toBe("completed");
    expect(resolveEntrustedJobStatus(baseAutomation())).toBe("scheduled");
  });

  it("summarizes without inventing needs_review counts", () => {
    const summary = summarizeEntrustedJobs([
      baseAutomation({ id: "1", enabled: true, status: "idle" }),
      baseAutomation({ id: "2", enabled: false, status: "idle" }),
      baseAutomation({ id: "3", enabled: true, status: "success" }),
    ]);
    expect(summary).toEqual({
      scheduled: 1,
      needsReview: 0,
      completed: 1,
      paused: 1,
    });
  });

  it("marks non-schedule triggers as coming soon", () => {
    const method = resolveScheduleMethod({
      kind: "webhook",
      label: "Webhook",
    });
    expect(method.supported).toBe(false);
    expect(method.label).toBe("順次対応");
  });

  it("blocks full_auto when critical external steps are enabled", () => {
    const flow: WorkExecutionFlow = {
      templateId: "sns_post",
      steps: [
        { id: "copywriting", enabled: true },
        { id: "publish", enabled: true },
      ],
    };
    expect(clampConfirmationLevel("full_auto", flow)).toBe("approve_then_run");
    expect(clampConfirmationLevel("draft_save", flow)).toBe("draft_save");
  });
});
