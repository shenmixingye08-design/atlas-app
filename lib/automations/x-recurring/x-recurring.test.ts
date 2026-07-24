import { describe, expect, it } from "vitest";

import {
  approvalModeLabel,
  buildXDestinationExecutionFlow,
  normalizeAutomationDestination,
  shouldAutoPublishToX,
  shouldAwaitXPostApproval,
} from "./destination";
import { getXRecurringError, mapConnectionFailureToError } from "./errors";
import { buildRecurringPostIdempotencyKey } from "./idempotency";
import {
  findPendingXPostBySlot,
  savePendingXPost,
  updatePendingXPost,
} from "./pending-store";
import type { Automation } from "@/lib/automations/types";
import { getEnabledStepIds } from "@/lib/automations/execution-flow";

function sampleAutomation(
  patch: Partial<Automation> = {},
): Automation {
  return {
    id: "auto-1",
    userId: "user-1",
    name: "X投稿",
    description: "",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      cron: "0 9 * * *",
      timezone: "Asia/Tokyo",
      label: "毎日 09:00",
    },
    workflow: { assignment: "Xへ投稿してください" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: buildXDestinationExecutionFlow("full_auto"),
    destination: "x",
    enabled: true,
    lastRun: null,
    nextRun: "2026-07-25T00:00:00.000Z",
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    ...patch,
  };
}

describe("x recurring destination", () => {
  it("normalizes destination and enables publish for X full_auto", () => {
    expect(normalizeAutomationDestination("x")).toBe("x");
    expect(normalizeAutomationDestination("other")).toBe("none");
    const flow = buildXDestinationExecutionFlow("full_auto");
    expect(flow.templateId).toBe("sns_post");
    expect(getEnabledStepIds(flow)).toContain("publish");
  });

  it("gates auto publish vs approval wait", () => {
    expect(shouldAutoPublishToX(sampleAutomation())).toBe(true);
    expect(
      shouldAwaitXPostApproval(
        sampleAutomation({ executionLevel: "approve_then_run" }),
      ),
    ).toBe(true);
    expect(
      shouldAutoPublishToX(sampleAutomation({ executionLevel: "draft_save" })),
    ).toBe(false);
    expect(approvalModeLabel("full_auto")).toBe("完全自動投稿");
  });
});

describe("x recurring errors", () => {
  it("maps connection failures to actionable messages", () => {
    expect(mapConnectionFailureToError({ connected: false }).code).toBe(
      "x_not_connected",
    );
    expect(
      mapConnectionFailureToError({
        connected: true,
        hasAccessToken: false,
      }).message,
    ).toContain("再連携");
    expect(getXRecurringError("x_text_empty").action.length).toBeGreaterThan(0);
  });
});

describe("pending x posts + idempotency", () => {
  it("prevents duplicate pending slots and records posted status", () => {
    const scheduledAt = "2026-07-25T00:00:00.000Z";
    const first = savePendingXPost({
      automationId: "auto-1",
      userId: "user-1",
      scheduledAt,
      generatedText: "hello",
      accountUsername: "atlas",
    });
    const second = savePendingXPost({
      automationId: "auto-1",
      userId: "user-1",
      scheduledAt,
      generatedText: "hello again",
      accountUsername: "atlas",
    });
    expect(second.id).toBe(first.id);
    expect(findPendingXPostBySlot("auto-1", scheduledAt)?.generatedText).toBe(
      "hello again",
    );

    updatePendingXPost(first.id, {
      status: "posted",
      xPostId: "123",
      xPostUrl: "https://x.com/atlas/status/123",
      postedAt: scheduledAt,
    });
    const third = savePendingXPost({
      automationId: "auto-1",
      userId: "user-1",
      scheduledAt,
      generatedText: "should keep posted",
      accountUsername: "atlas",
    });
    expect(third.status).toBe("posted");
    expect(third.xPostId).toBe("123");
    expect(buildRecurringPostIdempotencyKey("auto-1", scheduledAt)).toContain(
      "auto-1",
    );
  });
});
