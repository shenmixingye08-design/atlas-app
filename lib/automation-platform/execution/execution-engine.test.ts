import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));

import { mergeStepArtifacts } from "@/lib/automation-platform/execution/artifacts";
import {
  isRetryableFailure,
  classifyExecutionError,
} from "@/lib/automation-platform/execution/retry-policy";
import {
  resolveStepRetryPolicy,
} from "@/lib/automation-platform/execution/step-retry";
import { StepTimeoutError } from "@/lib/automation-platform/execution/step-timeout";
import {
  RUN_STATE_FLOW,
  STEP_STATE_FLOW,
  formatSprintRunAlias,
  SPRINT_RUN_STATE_MAP,
} from "@/lib/automation-platform/execution/state-diagram";
import { buildRunTimeline } from "@/lib/automation-platform/operations/timeline";
import { buildRunProgressView } from "@/lib/automation-platform/operations/progress";
import { buildAutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import { buildRunHistoryStats } from "@/lib/automation-platform/history/run-stats";
import { reclaimStuckRunningRuns } from "@/lib/automation-platform/operations/reclaim-stuck-runs";
import {
  memoryInsertRun,
  memoryUpdateRun,
  resetAutomationPlatformStoreForTests,
} from "@/lib/automation-platform/repository/memory-store";
import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import {
  resetAutomationAuditLogForTests,
  listAutomationAuditEvents,
} from "@/lib/automation-platform/audit/log";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { DEFAULT_INSTRUCTION } from "@/lib/automation-platform/types/instruction";
import { DEFAULT_EXECUTION_POLICY } from "@/lib/automation-platform/types/execution-policy";
import { DEFAULT_NOTIFICATION_POLICY } from "@/lib/automation-platform/types/notification-policy";
import { DEFAULT_MEMORY_POLICY } from "@/lib/automation-platform/types/memory-policy";

function baseStep(
  partial: Partial<AutomationWorkflowStep> & Pick<AutomationWorkflowStep, "id" | "type" | "name">,
): AutomationWorkflowStep {
  return {
    order: 1,
    inputBindings: {},
    configuration: {},
    requiresApproval: false,
    retryPolicy: { maxAttempts: 3, backoffMs: [1, 1, 1] },
    timeoutMs: 5_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
    ...partial,
  };
}

function sampleRun(overrides?: Partial<AutomationRun>): AutomationRun {
  const now = new Date().toISOString();
  return {
    id: "run_1",
    automationId: "auto_1",
    automationName: "資料作成",
    userId: "user_1",
    status: "queued",
    runKey: "rk",
    idempotencyKey: "ik",
    scheduleOccurrenceKey: null,
    triggerType: "manual",
    scheduledFor: null,
    queuedAt: now,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    attemptCount: 0,
    maxAttempts: 3,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    failedStepId: null,
    retryable: false,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: { used: [], updated: [], unusedScopes: [] },
    statusHistory: [],
    preparation: null,
    approval: { status: "not_required", mode: "none", requestedAt: null, decidedAt: null, decidedByUserId: null, comment: null, stepIds: [] },
    steps: [
      {
        id: "s1",
        capabilityId: "ocr",
        name: "OCR",
        order: 1,
        status: "pending",
        requiresApproval: false,
        highRisk: false,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        outputSummary: null,
      },
      {
        id: "s2",
        capabilityId: "excel_generate",
        name: "Excel生成",
        order: 2,
        status: "pending",
        requiresApproval: false,
        highRisk: false,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        outputSummary: null,
      },
      {
        id: "s3",
        capabilityId: "notify",
        name: "通知",
        order: 3,
        status: "pending",
        requiresApproval: false,
        highRisk: false,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        outputSummary: null,
      },
    ],
    artifacts: [],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: "diag_1",
    createdAt: now,
    updatedAt: now,
    memoryReferences: [],
    ...overrides,
  };
}

function sampleAutomation(steps: AutomationWorkflowStep[]): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_1",
    userId: "user_1",
    name: "資料作成",
    description: "",
    status: "active",
    trigger: { type: "manual", timezone: "Asia/Tokyo" },
    workflow: {
      version: 1,
      steps,
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: { workflowTimeoutMs: 600_000, stepDefaultTimeoutMs: 5_000 },
    },
    executionPolicy: {
      ...DEFAULT_EXECUTION_POLICY,
      mode: "run_then_notify",
    },
    notificationPolicy: DEFAULT_NOTIFICATION_POLICY,
    instruction: DEFAULT_INSTRUCTION,
    memoryPolicy: DEFAULT_MEMORY_POLICY,
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Automation Execution Engine", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetAutomationAuditLogForTests();
    delete (globalThis as { __ex?: number }).__ex;
  });

  it("maps sprint run/step state vocabulary", () => {
    expect(SPRINT_RUN_STATE_MAP.Completed).toBe("succeeded");
    expect(formatSprintRunAlias("needs_input")).toBe("Waiting Input");
    expect(RUN_STATE_FLOW.length).toBeGreaterThan(5);
    expect(STEP_STATE_FLOW.some((e) => e.to === "retrying")).toBe(true);
  });

  it("classifies 429/503/timeout as retryable and permission as not", () => {
    expect(
      isRetryableFailure({ errorCode: null, errorMessage: "HTTP 429 rate limit" }),
    ).toBe(true);
    expect(
      isRetryableFailure({ errorCode: null, errorMessage: "503 service unavailable" }),
    ).toBe(true);
    expect(
      isRetryableFailure({ errorCode: "automation_timeout", errorMessage: "timeout" }),
    ).toBe(true);
    expect(
      isRetryableFailure({ errorCode: null, errorMessage: "permission denied" }),
    ).toBe(false);
    expect(classifyExecutionError(new StepTimeoutError("OCR", 1000)).retryable).toBe(
      true,
    );
  });

  it("merges artifacts with stepId and prevents duplicates", () => {
    const first = mergeStepArtifacts({
      existing: [],
      incoming: [
        {
          id: "a1",
          kind: "file",
          label: "sheet.xlsx",
          url: null,
          externalId: "ext1",
          createdAt: new Date().toISOString(),
        },
      ],
      stepId: "s2",
    });
    expect(first[0]?.stepId).toBe("s2");
    const second = mergeStepArtifacts({
      existing: first,
      incoming: [
        {
          id: "a2",
          kind: "file",
          label: "sheet.xlsx",
          url: null,
          externalId: "ext1",
          createdAt: new Date().toISOString(),
        },
      ],
      stepId: "s2",
    });
    expect(second).toHaveLength(1);
  });

  it("retries transient step failure then succeeds without restarting prior steps", async () => {
    let ocrCalls = 0;
    const steps = [
      baseStep({ id: "s1", type: "ocr", name: "OCR", order: 1 }),
      baseStep({ id: "s2", type: "excel_generate", name: "Excel生成", order: 2 }),
    ];
    const automation = sampleAutomation(steps);
    const run = sampleRun({
      steps: [
        {
          id: "s1",
          capabilityId: "ocr",
          name: "OCR",
          order: 1,
          status: "succeeded",
          requiresApproval: false,
          highRisk: false,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          errorCode: null,
          errorMessage: null,
          attemptCount: 1,
          outputSummary: "done",
        },
        {
          id: "s2",
          capabilityId: "excel_generate",
          name: "Excel生成",
          order: 2,
          status: "pending",
          requiresApproval: false,
          highRisk: false,
          startedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          attemptCount: 0,
          outputSummary: null,
        },
      ],
    });
    memoryInsertRun(run);

    const result = await executeQueuedRun({
      run: memoryUpdateRun(run),
      automation,
      invoker: async ({ step }) => {
        if (step.type === "ocr") {
          ocrCalls += 1;
          return { ok: true, summary: "ocr", artifacts: [] };
        }
        ocrCalls += 0;
        // excel fails once with 503 then succeeds
        const attempts = (globalThis as { __ex?: number }).__ex ?? 0;
        (globalThis as { __ex?: number }).__ex = attempts + 1;
        if (attempts === 0) {
          return {
            ok: false,
            summary: "503 unavailable",
            artifacts: [],
            errorCode: "automation_run_failed",
            errorMessage: "503 service unavailable",
          };
        }
        return {
          ok: true,
          summary: "excel ok",
          artifacts: [
            {
              id: crypto.randomUUID(),
              kind: "file",
              label: "book.xlsx",
              url: null,
              externalId: "xlsx1",
              createdAt: new Date().toISOString(),
            },
          ],
        };
      },
    });

    expect(result.run.status).toBe("succeeded");
    expect(result.run.steps[0]?.status).toBe("succeeded");
    expect(result.run.steps[1]?.status).toBe("succeeded");
    expect(result.run.artifacts.length).toBe(1);
    expect(ocrCalls).toBe(0); // succeeded step not re-invoked
    delete (globalThis as { __ex?: number }).__ex;
  });

  it("stops for approval / needs input and does not complete", async () => {
    const steps = [baseStep({ id: "s1", type: "gmail", name: "Gmail", order: 1, requiresApproval: true })];
    const automation = sampleAutomation(steps);
    const run = sampleRun({
      steps: [
        {
          id: "s1",
          capabilityId: "gmail",
          name: "Gmail",
          order: 1,
          status: "pending",
          requiresApproval: true,
          highRisk: true,
          startedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          attemptCount: 0,
          outputSummary: null,
        },
      ],
      approval: {
        status: "approved",
        mode: "before_run",
        requestedAt: null,
        decidedAt: null,
        decidedByUserId: null,
        comment: null,
        stepIds: ["s1"],
      },
    });
    memoryInsertRun(run);

    const result = await executeQueuedRun({
      run,
      automation,
      invoker: async () => ({
        ok: false,
        summary: "宛先が必要です",
        artifacts: [],
        needsUserInput: true,
        errorCode: "automation_integration_required",
        errorMessage: "missing to",
      }),
    });

    expect(result.run.status).toBe("needs_input");
    expect(result.terminal).toBe(false);
    expect(result.run.status).not.toBe("succeeded");
  });

  it("times out a hung step as retryable failure classification", () => {
    const err = new StepTimeoutError("OCR", 10);
    const classified = classifyExecutionError(err);
    expect(classified.code).toBe("automation_timeout");
    expect(classified.retryable).toBe(true);
  });

  it("builds timeline with 完了 / 実行中 / 待機", () => {
    const run = sampleRun({
      status: "running",
      steps: [
        {
          id: "s1",
          capabilityId: "ocr",
          name: "OCR",
          order: 1,
          status: "succeeded",
          requiresApproval: false,
          highRisk: false,
          startedAt: "2026-08-02T09:00:00.000Z",
          completedAt: "2026-08-02T09:00:30.000Z",
          errorCode: null,
          errorMessage: null,
          attemptCount: 1,
          outputSummary: "ok",
        },
        {
          id: "s2",
          capabilityId: "excel_generate",
          name: "Excel生成",
          order: 2,
          status: "running",
          requiresApproval: false,
          highRisk: false,
          startedAt: "2026-08-02T09:01:00.000Z",
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          attemptCount: 1,
          outputSummary: null,
        },
        {
          id: "s3",
          capabilityId: "pdf_generate",
          name: "PDF生成",
          order: 3,
          status: "pending",
          requiresApproval: false,
          highRisk: false,
          startedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          attemptCount: 0,
          outputSummary: null,
        },
      ],
    });
    const timeline = buildRunTimeline(run);
    expect(timeline.some((e) => e.title.includes("完了"))).toBe(true);
    expect(timeline.some((e) => e.title.includes("実行中"))).toBe(true);
    expect(timeline.some((e) => e.title.includes("待機"))).toBe(true);

    const progress = buildRunProgressView(run);
    expect(progress.currentStepName).toBe("Excel生成");
    expect(progress.nextStepName).toBe("PDF生成");
  });

  it("history stats expose success rate and duration", () => {
    const run = sampleRun({
      status: "partially_succeeded",
      startedAt: "2026-08-02T09:00:00.000Z",
      completedAt: "2026-08-02T09:05:00.000Z",
      durationMs: 300_000,
      steps: [
        {
          id: "s1",
          capabilityId: "ocr",
          name: "OCR",
          order: 1,
          status: "succeeded",
          requiresApproval: false,
          highRisk: false,
          startedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          attemptCount: 1,
          outputSummary: null,
        },
        {
          id: "s2",
          capabilityId: "dropbox",
          name: "Dropbox",
          order: 2,
          status: "failed",
          requiresApproval: false,
          highRisk: false,
          startedAt: null,
          completedAt: null,
          errorCode: "x",
          errorMessage: "fail",
          attemptCount: 1,
          outputSummary: null,
        },
      ],
      artifacts: [
        {
          id: "a1",
          kind: "file",
          label: "a",
          url: null,
          externalId: null,
          createdAt: "2026-08-02T09:01:00.000Z",
          stepId: "s1",
        },
      ],
    });
    const stats = buildRunHistoryStats(run);
    expect(stats.successRate).toBe(50);
    expect(stats.artifactCount).toBe(1);
    expect(stats.durationLabel).toContain("分");
  });

  it("dashboard summary includes retrying / completed / executed today", () => {
    const now = new Date();
    const run = sampleRun({
      status: "retrying",
      startedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    const summary = buildAutomationOperationsSummary({
      automations: [],
      runs: [run],
      now,
    });
    expect(summary.counts.retrying).toBe(1);
    expect(summary.counts.executedToday).toBe(1);
  });

  it("reclaims stuck running runs after worker crash window", () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const run = sampleRun({
      status: "running",
      updatedAt: old,
      startedAt: old,
      steps: [
        {
          id: "s1",
          capabilityId: "ocr",
          name: "OCR",
          order: 1,
          status: "succeeded",
          requiresApproval: false,
          highRisk: false,
          startedAt: old,
          completedAt: old,
          errorCode: null,
          errorMessage: null,
          attemptCount: 1,
          outputSummary: "ok",
        },
        {
          id: "s2",
          capabilityId: "excel_generate",
          name: "Excel",
          order: 2,
          status: "running",
          requiresApproval: false,
          highRisk: false,
          startedAt: old,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          attemptCount: 1,
          outputSummary: null,
        },
      ],
    });
    memoryInsertRun(run);
    const result = reclaimStuckRunningRuns({ olderThanMs: 15 * 60 * 1000 });
    expect(result.reclaimed).toBe(1);
    const audits = listAutomationAuditEvents();
    expect(audits.some((a) => a.action === "automation.run.reclaim")).toBe(true);
  });

  it("resolves step retry policy max attempts", () => {
    const policy = resolveStepRetryPolicy(
      baseStep({
        id: "s1",
        type: "ocr",
        name: "OCR",
        retryPolicy: { maxAttempts: 2, backoffMs: [10] },
      }),
      5,
    );
    expect(policy.maxAttempts).toBe(2);
    expect(policy.isRetryable(null, "429")).toBe(true);
    expect(policy.isRetryable(null, "unauthorized")).toBe(false);
  });
});
