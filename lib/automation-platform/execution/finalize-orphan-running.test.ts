import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/automation-platform/durable", () => ({
  getAutomationV2FromSot: vi.fn(),
}));
vi.mock("@/lib/automation-platform/durable-runs", () => ({
  persistAutomationRunNow: vi.fn(async (run) => run),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(() => null),
}));

import { getAutomationV2FromSot } from "@/lib/automation-platform/durable";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import { finalizeOrphanRunningRun } from "@/lib/automation-platform/execution/finalize-orphan-running";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";

function sampleRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  const now = "2026-08-12T17:54:32.564Z";
  return {
    id: "c3291eaf-6669-400c-bdd8-2d9d735d726d",
    automationId: "603d2f3c-1fdd-4984-8531-ba4028a42b87",
    automationName: "カレンダー入力自動化テスト",
    userId: "user_test",
    status: "running",
    triggerType: "retry",
    runKey: "manual:test",
    idempotencyKey: "safe-retry:test",
    scheduleOccurrenceKey: null,
    scheduledFor: null,
    queuedAt: now,
    startedAt: now,
    completedAt: null,
    attemptCount: 1,
    maxAttempts: 3,
    nextRetryAt: null,
    retryable: false,
    lastErrorCode: null,
    lastErrorMessage: null,
    failedStepId: null,
    needsUserInput: false,
    resultSummary: "前回実行から安全に再実行",
    resolvedInstruction: null,
    diagnosticId: "daec9e0c-87df-4d09-826c-437f085408ca",
    approval: { status: "approved", mode: "run_then_notify" },
    approvalExpiresAt: null,
    statusHistory: [],
    attempts: [],
    steps: [
      {
        id: "notify",
        capabilityId: "notify",
        name: "通知",
        status: "skipped",
        order: 0,
        startedAt: null,
        completedAt: now,
        attemptCount: 0,
        errorCode: null,
        errorMessage: null,
        outputSummary: "通知を送信しました",
        requiresApproval: false,
        highRisk: false,
      },
      {
        id: "google_calendar",
        capabilityId: "google_calendar",
        name: "カレンダー",
        status: "succeeded",
        order: 1,
        startedAt: now,
        completedAt: now,
        attemptCount: 1,
        errorCode: null,
        errorMessage: null,
        outputSummary: "Google Calendarに予定を登録しました",
        requiresApproval: false,
        highRisk: false,
      },
    ],
    artifacts: [
      {
        id: "ntf_be48801a-b0bf-4e5e-9d5d-bf8fe3da312e",
        kind: "file",
        label: "notify",
        url: "/notifications/ntf_be48801a-b0bf-4e5e-9d5d-bf8fe3da312e",
        externalId: "ntf_be48801a-b0bf-4e5e-9d5d-bf8fe3da312e",
        createdAt: now,
      },
      {
        id: "google_calendar_143cl8h6ddk0m39oki6opfdegc",
        kind: "file",
        label: "create_event",
        url: "https://calendar.google.com/event?eid=143cl8h6ddk0m39oki6opfdegc",
        externalId: "143cl8h6ddk0m39oki6opfdegc",
        createdAt: now,
      },
    ],
    memoryUsage: { used: [], updated: [], memoryIdsUsed: [] },
    memoryReferences: [],
    completionEvidence: null,
    durationMs: null,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 2,
    ...overrides,
  } as unknown as AutomationRun;
}

function sampleAutomation(): AutomationV2 {
  return {
    id: "603d2f3c-1fdd-4984-8531-ba4028a42b87",
    userId: "user_test",
    name: "カレンダー入力自動化テスト",
    description: "",
    status: "active",
    trigger: { type: "schedule", cron: "0 1 * * *", timezone: "Asia/Tokyo" },
    workflow: {
      steps: [
        {
          id: "notify",
          type: "notify",
          name: "通知",
          order: 0,
          enabled: true,
          requiresApproval: false,
          inputBindings: {},
          configuration: {},
          retryPolicy: { maxAttempts: 1, backoffMs: [0] },
          timeoutMs: 10_000,
          onSuccess: null,
          onFailure: null,
        },
        {
          id: "google_calendar",
          type: "google_calendar",
          name: "カレンダー",
          order: 1,
          enabled: true,
          requiresApproval: false,
          inputBindings: {},
          configuration: { eventTitle: "MINERVOT自動化テスト" },
          retryPolicy: { maxAttempts: 1, backoffMs: [0] },
          timeoutMs: 10_000,
          onSuccess: null,
          onFailure: null,
        },
      ],
      onFailure: { strategy: "stop" },
    },
    executionPolicy: {},
    notificationPolicy: {
      beforeRun: false,
      onSuccess: true,
      onFailure: true,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    instruction: {
      freeformNotes:
        "毎日一時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して",
      structuredOptions: { requiredExternals: ["google_calendar"] },
    },
    memoryPolicy: {},
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  } as unknown as AutomationV2;
}

describe("finalizeOrphanRunningRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAutomationV2FromSot).mockResolvedValue(sampleAutomation());
    vi.mocked(persistAutomationRunNow).mockImplementation(async (run) => run);
  });

  it("finalizes stuck running run with calendar evidence to succeeded", async () => {
    const finalized = await finalizeOrphanRunningRun(sampleRun());
    expect(finalized).not.toBeNull();
    expect(finalized?.status).toBe("succeeded");
    expect(finalized?.completionEvidence?.externalActionIds).toContain(
      "143cl8h6ddk0m39oki6opfdegc",
    );
    expect(finalized?.completedAt).toBeTruthy();
    expect(persistAutomationRunNow).toHaveBeenCalled();
  });

  it("returns null when steps are still unresolved", async () => {
    const run = sampleRun({
      steps: [
        {
          id: "google_calendar",
          capabilityId: "google_calendar",
          name: "カレンダー",
          status: "running",
          order: 0,
          startedAt: "2026-08-12T17:54:32.564Z",
          completedAt: null,
          attemptCount: 1,
          errorCode: null,
          errorMessage: null,
          outputSummary: null,
          requiresApproval: false,
          highRisk: false,
        },
      ],
    } as Partial<AutomationRun>);
    await expect(finalizeOrphanRunningRun(run)).resolves.toBeNull();
  });
});
