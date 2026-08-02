import { describe, expect, it } from "vitest";

import type { AutomationRun } from "@/lib/automation-platform/types";
import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import {
  buildRunningJobsFromRuns,
  buildWeeklyStatsFromRuns,
  mapOpsAttentionToHomeItems,
  mapOpsTodayWorkToTimeline,
} from "./home-data";

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
    automationName: "毎朝メール要約",
    userId: "user_a",
    status: "running",
    runKey: "rk",
    idempotencyKey: "ik",
    scheduleOccurrenceKey: null,
    triggerType: "schedule",
    scheduledFor: now,
    queuedAt: now,
    startedAt: now,
    completedAt: null,
    durationMs: null,
    attemptCount: 1,
    maxAttempts: 3,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    failedStepId: null,
    retryable: false,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: { used: [], updated: [], unusedScopes: [] },
    memoryReferences: [],
    statusHistory: [],
    preparation: null,
    approval: null,
    steps: [
      sampleStep({
        id: "s1",
        name: "メール取得",
        order: 0,
        status: "succeeded",
        startedAt: now,
        completedAt: now,
      }),
      sampleStep({
        id: "s2",
        name: "要約作成",
        order: 1,
        status: "running",
        startedAt: now,
      }),
      sampleStep({
        id: "s3",
        name: "下書き保存",
        order: 2,
        status: "pending",
      }),
    ],
    artifacts: [],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: "diag_1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("automation-first home data adapters", () => {
  it("maps ops attention into distinct home kinds", () => {
    const attention: AutomationOperationsSummary["attention"] = [
      {
        kind: "awaiting_approval",
        title: "X投稿",
        subtitle: "公開前の確認",
        href: "/automations/runs/r1",
        at: "2026-08-01T13:00:00.000Z",
        runId: "r1",
      },
      {
        kind: "needs_input",
        title: "請求書整理",
        subtitle: "保存先が不足",
        href: "/automations/runs/r2",
        at: "2026-08-01T20:00:00.000Z",
        runId: "r2",
      },
      {
        kind: "failed",
        title: "週次レポート",
        subtitle: "Excel集計で失敗",
        href: "/automations/runs/r3",
        at: "2026-08-01T18:00:00.000Z",
        runId: "r3",
      },
      {
        kind: "running",
        title: "実行中は除外",
        subtitle: "running",
        href: "/automations/runs/r4",
        at: null,
        runId: "r4",
      },
    ];

    const items = mapOpsAttentionToHomeItems(attention);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(["approval", "input", "failed"]);
    expect(items.find((i) => i.kind === "failed")?.actionLabel).toBe("修復する");
  });

  it("builds timeline rows with current step from runs", () => {
    const run = sampleRun({ id: "run-1" });
    const rows = mapOpsTodayWorkToTimeline(
      [
        {
          timeLabel: "08:00",
          title: "毎朝メール要約",
          statusLabel: "実行中",
          href: `/automations/runs/${encodeURIComponent(run.id)}`,
          sortAt: Date.parse("2026-08-01T08:00:00.000Z"),
          tone: "info",
        },
      ],
      [run],
    );
    expect(rows[0]?.currentStep).toBe("要約作成");
    expect(rows[0]?.status).toBe("running");
    expect(rows[0]?.nextAction).toBe("進捗を見る");
  });

  it("lists running step markers without inventing percent progress", () => {
    const jobs = buildRunningJobsFromRuns([sampleRun({ id: "run-2" })]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.steps.map((s) => s.marker)).toEqual([
      "done",
      "active",
      "waiting",
    ]);
  });

  it("computes weekly stats and omits unsourced saved minutes", () => {
    const now = new Date().toISOString();
    const stats = buildWeeklyStatsFromRuns([
      sampleRun({
        id: "run-ok",
        status: "succeeded",
        completedAt: now,
        artifacts: [
          {
            id: "a1",
            label: "要約.md",
            kind: "file",
            url: null,
            externalId: null,
            createdAt: now,
          },
        ],
        steps: [
          sampleStep({
            id: "s1",
            name: "step",
            status: "succeeded",
          }),
        ],
      }),
    ]);
    expect(stats.completedJobs).toBe(1);
    expect(stats.artifactCount).toBe(1);
    expect(stats.savedMinutes).toBeNull();
  });
});
