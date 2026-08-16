import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  loadDurableDomain: vi.fn(async () => null),
  persistDurableDomain: vi.fn(async () => undefined),
}));
vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-${automation.id}`,
    registered: true,
  })),
}));
vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(),
}));

import { resetAutomationAuditLogForTests } from "@/lib/automation-platform/audit/log";
import { resetAutomationRunsV2DurableForTests } from "@/lib/automation-platform/durable-runs";
import { applyRunRetentionPolicy } from "@/lib/automation-platform/history/retention";
import {
  filterAutomationRuns,
  sortAutomationRuns,
} from "@/lib/automation-platform/history/search";
import { describeNeedsInput } from "@/lib/automation-platform/operations/needs-input";
import { buildFailureUserView } from "@/lib/automation-platform/operations/failure-view";
import {
  prepareStepsForSafeRetry,
  shouldSkipOnRetry,
} from "@/lib/automation-platform/operations/idempotency";
import { buildRunProgressView } from "@/lib/automation-platform/operations/progress";
import { buildAutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import { buildRunTimeline } from "@/lib/automation-platform/operations/timeline";
import {
  formatRunHeadline,
  formatRunStatus,
} from "@/lib/automation-platform/operations/status-labels";
import { resetAutomationPlatformStoreForTests } from "@/lib/automation-platform/repository/memory-store";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import type { AutomationRun } from "@/lib/automation-platform/types";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { DEFAULT_EXECUTION_POLICY } from "@/lib/automation-platform/types/execution-policy";
import { DEFAULT_NOTIFICATION_POLICY } from "@/lib/automation-platform/types/notification-policy";
import { DEFAULT_MEMORY_POLICY } from "@/lib/automation-platform/types/memory-policy";
import { DEFAULT_INSTRUCTION } from "@/lib/automation-platform/types/instruction";

const ownerContext = buildFeatureAccessContext("owner@example.com");

function sampleStep(
  overrides: Partial<AutomationRun["steps"][number]> = {},
): AutomationRun["steps"][number] {
  return {
    id: "step_1",
    capabilityId: "excel_generate",
    name: "Excel生成",
    order: 0,
    status: "pending",
    requiresApproval: false,
    highRisk: false,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    attemptCount: 0,
    outputSummary: null,
    ...overrides,
  };
}

function sampleRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  const now = new Date().toISOString();
  return {
    id: "run_1",
    automationId: "auto_1",
    automationName: "売上集計",
    userId: "user_a",
    status: "failed",
    runKey: "rk",
    idempotencyKey: "ik",
    scheduleOccurrenceKey: null,
    triggerType: "manual",
    scheduledFor: null,
    queuedAt: now,
    startedAt: now,
    completedAt: now,
    durationMs: 12000,
    attemptCount: 2,
    maxAttempts: 3,
    nextRetryAt: null,
    lastErrorCode: "automation_run_failed",
    lastErrorMessage: "Dropboxの保存先フォルダが見つかりません",
    failedStepId: "step_dropbox",
    retryable: true,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: { used: [], updated: [], unusedScopes: [] },
    memoryReferences: [],
    statusHistory: [
      {
        previousStatus: "queued",
        nextStatus: "running",
        timestamp: now,
        reason: "claim_and_start",
        actor: { type: "worker", component: "executor" },
        diagnosticId: "diag_1",
      },
      {
        previousStatus: "running",
        nextStatus: "failed",
        timestamp: now,
        reason: "execution_failed",
        actor: { type: "worker", component: "executor" },
        diagnosticId: "diag_1",
      },
    ],
    preparation: {
      summary: "売上を集計して保存",
      plannedSteps: [],
      approvalReason: null,
      approvalStepIds: [],
      externalEffects: ["dropbox"],
      estimatedDurationLabel: "3〜5分",
      timezone: "Asia/Tokyo",
      scheduledLabel: "手動",
      preparedAt: now,
    },
    approval: null,
    steps: [
      sampleStep({
        id: "step_excel",
        name: "Excel生成",
        status: "succeeded",
        capabilityId: "excel_generate",
        startedAt: now,
        completedAt: now,
      }),
      sampleStep({
        id: "step_dropbox",
        name: "Dropbox保存",
        status: "failed",
        capabilityId: "dropbox",
        errorMessage: "Dropboxの保存先フォルダが見つかりません",
        completedAt: now,
      }),
      sampleStep({
        id: "step_mail",
        name: "メール送信",
        status: "pending",
        capabilityId: "gmail",
      }),
    ],
    artifacts: [
      {
        id: "art_1",
        kind: "file",
        label: "売上.xlsx",
        url: "/files/sales.xlsx",
        externalId: null,
        createdAt: now,
      },
    ],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: "1 件成功 / 1 件失敗",
    diagnosticId: "diag_1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sampleAutomation(
  overrides: Partial<AutomationV2> = {},
): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_1",
    userId: "user_a",
    name: "売上集計",
    description: "毎日の売上",
    status: "active",
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: {
        frequency: "daily",
        hour: 9,
        minute: 0,
      },
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps: [
        {
          id: "step_excel",
          type: "excel_generate",
          name: "Excel生成",
          order: 0,
          inputBindings: {},
          configuration: {},
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [] },
          timeoutMs: 60_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
      ],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 600_000,
        stepDefaultTimeoutMs: 60_000,
      },
    },
    executionPolicy: DEFAULT_EXECUTION_POLICY,
    notificationPolicy: DEFAULT_NOTIFICATION_POLICY,
    instruction: DEFAULT_INSTRUCTION,
    memoryPolicy: DEFAULT_MEMORY_POLICY,
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: now,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Automation Operations", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
    resetAutomationPlatformStoreForTests();
    resetAutomationRunsV2DurableForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    setFeatureFlagState("automation_v2_enabled", "on");
    setFeatureFlagState("automation_operations_enabled", "on");
  });

  it("1. builds operations dashboard summary", () => {
    const summary = buildAutomationOperationsSummary({
      automations: [
        sampleAutomation(),
        sampleAutomation({
          id: "auto_2",
          name: "X投稿",
          status: "paused",
          nextRunAt: null,
        }),
      ],
      runs: [
        sampleRun({ status: "awaiting_approval", needsUserInput: false }),
        sampleRun({
          id: "run_2",
          status: "needs_input",
          needsUserInput: true,
          lastErrorMessage: "メール送信先がありません",
        }),
        sampleRun({ id: "run_3", status: "succeeded", failedStepId: null }),
      ],
    });
    expect(summary.counts.activeAutomations).toBe(1);
    expect(summary.counts.pausedAutomations).toBe(1);
    expect(summary.counts.awaitingApproval).toBe(1);
    expect(summary.counts.needsInput).toBe(1);
    expect(summary.todayWork.length).toBeGreaterThan(0);
    expect(summary.attention.some((item) => item.kind === "awaiting_approval")).toBe(
      true,
    );
  });

  it("2. labels run statuses in Japanese", () => {
    expect(formatRunStatus("awaiting_approval")).toBe("確認待ちです");
    expect(formatRunStatus("succeeded")).toBe("仕事が完了しました");
    expect(formatRunStatus("failed")).toBe("完了できませんでした");
    expect(formatRunStatus("partially_succeeded")).toBe(
      "一部完了しました。確認が必要です",
    );
    expect(formatRunStatus("preparing")).toBe("準備済みです");
    expect(formatRunStatus("needs_input")).toBe("入力待ちです");
  });

  it("2b. auto-exec headline never says 確認待ち・手動", () => {
    const auto = {
      triggerType: "manual" as const,
      approval: { mode: "run_then_notify", status: "not_required" },
      preparation: { approvalReason: null },
    };
    expect(
      formatRunHeadline({ ...auto, status: "running" }),
    ).toBe("実行中 · 自動実行");
    expect(
      formatRunHeadline({ ...auto, status: "preparing" }),
    ).toBe("実行中 · 自動実行");
    expect(
      formatRunHeadline({ ...auto, status: "succeeded" }),
    ).toBe("完了 · 自動実行");
    expect(
      formatRunHeadline({ ...auto, status: "awaiting_approval" }),
    ).toBe("実行中 · 自動実行");
    expect(formatRunHeadline({ ...auto, status: "running" })).not.toContain(
      "確認待ち",
    );
    expect(formatRunHeadline({ ...auto, status: "running" })).not.toContain(
      "手動",
    );
    expect(
      formatRunHeadline({
        status: "awaiting_approval",
        triggerType: "schedule",
        approval: { mode: "review_before_run", status: "pending" },
        preparation: { approvalReason: "review_before_run" },
      }),
    ).toContain("確認待ち");
  });

  it("3. builds step timeline", () => {
    const timeline = buildRunTimeline(sampleRun());
    expect(timeline.some((entry) => entry.title.includes("Excel"))).toBe(true);
    expect(timeline.some((entry) => entry.title.includes("Dropbox"))).toBe(true);
  });

  it("4. builds in-progress view with estimated remaining", () => {
    const progress = buildRunProgressView(
      sampleRun({
        status: "running",
        steps: [
          sampleStep({ id: "a", name: "取得", status: "succeeded" }),
          sampleStep({
            id: "b",
            name: "PowerPoint",
            status: "running",
            capabilityId: "powerpoint_generate",
          }),
          sampleStep({ id: "c", name: "PDF", status: "pending", capabilityId: "pdf_generate" }),
        ],
      }),
    );
    expect(progress.currentStepName).toBe("PowerPoint");
    expect(progress.estimatedRemainingLabel).toContain("推定");
  });

  it("5. describes needs_input concretely", () => {
    expect(
      describeNeedsInput(
        sampleRun({
          status: "needs_input",
          needsUserInput: true,
          lastErrorMessage: "recipient missing",
          failedStepId: "step_mail",
          steps: [
            sampleStep({
              id: "step_mail",
              name: "メール送信",
              capabilityId: "gmail",
              status: "waiting_approval",
              errorMessage: "送信先が未設定",
            }),
          ],
        }),
      ),
    ).toContain("メール送信先");
  });

  it("6. builds partial success failure view and keeps artifacts", () => {
    const view = buildFailureUserView(
      sampleRun({ status: "partially_succeeded" }),
    );
    expect(view.headline).toContain("成果物");
    expect(view.affectedArtifacts).toHaveLength(1);
    expect(view.succeededSteps.map((s) => s.name)).toContain("Excel生成");
    expect(view.technical.diagnosticId).toBe("diag_1");
  });

  it("7. skips succeeded external actions on retry preparation", () => {
    const steps = [
      sampleStep({
        id: "mail",
        capabilityId: "gmail",
        status: "succeeded",
        name: "メール送信",
      }),
      sampleStep({
        id: "drop",
        capabilityId: "dropbox",
        status: "failed",
        name: "Dropbox",
      }),
    ];
    expect(shouldSkipOnRetry(steps[0]!)).toBe(true);
    const prepared = prepareStepsForSafeRetry(steps, {
      mode: "from_failed",
      failedStepId: "drop",
    });
    // Remains succeeded so completion gates do not treat it as required_skipped.
    expect(prepared[0]?.status).toBe("succeeded");
    expect(prepared[1]?.status).toBe("pending");
  });

  it("8. filters and sorts runs for search", () => {
    const runs = [
      sampleRun({ id: "a", status: "succeeded", automationName: "週次報告" }),
      sampleRun({
        id: "b",
        status: "failed",
        diagnosticId: "diag_special",
        attemptCount: 3,
      }),
    ];
    const filtered = filterAutomationRuns(runs, {
      query: "diag_special",
      hasRetry: true,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("b");
    const byName = sortAutomationRuns(runs, "name").map((run) => run.automationName);
    expect(byName).toContain("売上集計");
    expect(byName).toContain("週次報告");
    expect(byName).toHaveLength(2);
  });

  it("9. applies retention policy without unbounded technical logs", () => {
    const old = sampleRun({
      id: "old",
      updatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      statusHistory: Array.from({ length: 20 }, (_, i) => ({
        previousStatus: "queued" as const,
        nextStatus: "running" as const,
        timestamp: new Date().toISOString(),
        reason: `r${i}`,
        actor: { type: "worker" as const, component: "executor" },
        diagnosticId: "d",
      })),
    });
    const kept = applyRunRetentionPolicy([old, sampleRun({ id: "new" })]);
    expect(kept.some((run) => run.id === "new")).toBe(true);
    const stripped = kept.find((run) => run.id === "old");
    if (stripped) {
      expect(stripped.statusHistory.length).toBeLessThanOrEqual(3);
    }
  });

  it("10. denies other-user run access", async () => {
    const created = await automationPlatformService.create(
      "user_a",
      {
        name: "権限テスト",
        trigger: {
          type: "manual",
          timezone: "Asia/Tokyo",
          schedule: null,
          event: null,
          condition: null,
        },
        workflow: sampleAutomation().workflow,
        status: "active",
      },
      ownerContext,
    );
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_a",
      automationId: created.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });

    await expect(
      automationPlatformService.getRun("user_b", run.id, ownerContext),
    ).rejects.toMatchObject({ code: "run_permission_denied" });

    await expect(
      automationPlatformService.retryRun("user_b", run.id, ownerContext),
    ).rejects.toMatchObject({ code: "run_permission_denied" });

    await expect(
      automationPlatformService.approveRun("user_b", run.id, ownerContext),
    ).rejects.toMatchObject({ code: "run_permission_denied" });
  });

  it("11. diagnosticId lookup stays ownership-scoped", async () => {
    await expect(
      automationPlatformService.getRunByDiagnosticId(
        "user_a",
        "missing-diag",
        ownerContext,
      ),
    ).rejects.toMatchObject({ code: "run_not_found" });
  });

  it("12. cancel stops pending steps and preserves artifacts", async () => {
    const created = await automationPlatformService.create(
      "user_a",
      {
        name: "キャンセル",
        trigger: {
          type: "manual",
          timezone: "Asia/Tokyo",
          schedule: null,
          event: null,
          condition: null,
        },
        workflow: sampleAutomation().workflow,
        status: "active",
        executionPolicy: {
          ...DEFAULT_EXECUTION_POLICY,
          mode: "run_then_notify",
        },
      },
      ownerContext,
    );
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_a",
      automationId: created.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });
    const cancelled = await automationPlatformService.cancelRun(
      "user_a",
      run.id,
      ownerContext,
      { reason: "不要になった" },
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.resultSummary).toContain("不要になった");
  });

  it("13. pause does not backfill on resume", async () => {
    const created = await automationPlatformService.create(
      "user_a",
      {
        name: "一時停止再開",
        trigger: {
          type: "schedule",
          timezone: "Asia/Tokyo",
          schedule: {
            frequency: "daily",
            hour: 9,
            minute: 0,
          },
          event: null,
          condition: null,
        },
        workflow: sampleAutomation().workflow,
        status: "active",
      },
      ownerContext,
    );
    const paused = await automationPlatformService.pause(
      "user_a",
      created.id,
      ownerContext,
    );
    expect(paused.automation.status).toBe("paused");
    expect(paused.effects.nextRunAt).toBeNull();
    const resumed = await automationPlatformService.resume(
      "user_a",
      created.id,
      ownerContext,
    );
    expect(resumed.status).toBe("active");
    expect(resumed.nextRunAt).toBeTruthy();
  });
});
