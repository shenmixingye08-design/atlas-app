import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));
vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-${automation.id}`,
    registered: true,
  })),
}));
vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(() => ({
    notificationId: `ntf_${Math.random().toString(16).slice(2)}`,
  })),
}));
vi.mock("@/lib/personal-memory/bridge/automation", () => ({
  resolveMemoryForAutomation: vi.fn(async () => ({
    memoryUsage: {
      used: [
        {
          scope: "writing_style",
          key: "tone",
          summary: "丁寧語",
          source: "user_memory",
        },
      ],
      updated: [],
      unusedScopes: [],
    },
    ledger: {
      memoryIdsUsed: ["mem_1"],
      memoryValuesResolved: [
        {
          memoryId: "mem_1",
          scope: "writing_style",
          key: "tone",
          value: { text: "丁寧語" },
          title: "文体",
          summary: "丁寧語",
          source: "explicit",
          layer: "global_memory",
          sensitivity: "normal",
        },
      ],
      memoryConflicts: [],
      memoryOverrides: [],
      memoryCandidateUpdates: [],
      unusedMemoryIds: [],
    },
    injectionText: "丁寧語で書いてください",
    tokenEstimate: 40,
  })),
}));

import { createNotification } from "@/lib/notifications/service";
import {
  resetAutomationAuditLogForTests,
} from "@/lib/automation-platform/audit/log";
import {
  listAutomationRunCosts,
  resetAutomationRunCostsForTests,
  summarizeAutomationCosts,
  estimateStepCost,
  recordAutomationRunCost,
} from "@/lib/automation-platform/cost/run-cost";
import {
  createControlledInvoker,
  percentile,
  type E2EEvidence,
} from "@/lib/automation-platform/e2e/harness";
import { dispatchAutomationRuns } from "@/lib/automation-platform/execution/dispatch";
import {
  memoryDeleteRunForTests,
  memoryGetAutomation,
  memoryUpdateAutomation,
  resetAutomationPlatformStoreForTests,
} from "@/lib/automation-platform/repository/memory-store";
import { processDueScheduledAutomationsV2 } from "@/lib/automation-platform/schedule/due-tick";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type {
  CreateAutomationV2Input,
  AutomationWorkflowStep,
} from "@/lib/automation-platform/types";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";

const ownerContext = buildFeatureAccessContext("owner@example.com");
const evidence: E2EEvidence[] = [];
const ARTIFACTS_DIR = "/opt/cursor/artifacts/automation-e2e";

function enableFlags(): void {
  setFeatureFlagState("automation_v2_enabled", "on");
  setFeatureFlagState("automation_memory_enabled", "on");
  setFeatureFlagState("automation_approval_enabled", "on");
  setFeatureFlagState("automation_operations_enabled", "on");
}

function step(
  partial: Partial<AutomationWorkflowStep> &
    Pick<AutomationWorkflowStep, "id" | "type" | "name" | "order">,
): AutomationWorkflowStep {
  return {
    inputBindings: {},
    configuration: {},
    requiresApproval: false,
    retryPolicy: { maxAttempts: 2, backoffMs: [10] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
    ...partial,
  };
}

function workflow(
  steps: AutomationWorkflowStep[],
): CreateAutomationV2Input["workflow"] {
  return {
    version: 1,
    steps,
    onFailure: { strategy: "stop", notify: true },
    timeoutPolicy: {
      workflowTimeoutMs: 120_000,
      stepDefaultTimeoutMs: 15_000,
    },
  };
}

async function createAutomation(
  name: string,
  input: Partial<CreateAutomationV2Input> & {
    workflow: CreateAutomationV2Input["workflow"];
  },
) {
  return automationPlatformService.create(
    "user_e2e",
    {
      name,
      status: "active",
      trigger: {
        type: "schedule",
        timezone: "Asia/Tokyo",
        schedule: {
          frequency: "weekly",
          hour: 18,
          minute: 0,
          daysOfWeek: [5],
        },
        event: null,
        condition: null,
      },
      executionPolicy: { mode: "run_then_notify" },
      notificationPolicy: {
        beforeRun: true,
        onSuccess: true,
        onFailure: true,
        onNeedsInput: true,
        channels: ["in_app"],
      },
      memoryPolicy: {
        enabled: true,
        allowedScopes: ["writing_style", "document_design", "default_storage_locations"],
        deniedScopes: [],
        lockedOverrides: {},
      },
      ...input,
    },
    ownerContext,
  );
}

function pushEvidence(row: E2EEvidence): void {
  evidence.push(row);
}

function hasLiveExternal(): boolean {
  return process.env.AUTOMATION_E2E_LIVE_EXTERNAL === "true";
}

describe("Automation E2E Reliability", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    resetAutomationRunCostsForTests();
    resetFeatureFlagStore();
    enableFlags();
    vi.mocked(createNotification).mockClear();
  });

  it(
    "scenario matrix + schedule fire + security + endurance (controlled)",
    async () => {
    const started = Date.now();

    // -------- Scenario 1-7: external-required → blocked without live creds --------
    const externalScenarios: Array<{
      id: string;
      name: string;
      steps: AutomationWorkflowStep[];
    }> = [
      {
        id: "s1_weekly_sales",
        name: "毎週売上レポート",
        steps: [
          step({ id: "a", type: "data_extract", name: "売上取得", order: 0 }),
          step({ id: "b", type: "excel_generate", name: "Excel", order: 1 }),
          step({
            id: "c",
            type: "powerpoint_generate",
            name: "PowerPoint",
            order: 2,
          }),
          step({ id: "d", type: "pdf_generate", name: "PDF", order: 3 }),
          step({
            id: "e",
            type: "dropbox",
            name: "Dropbox",
            order: 4,
            configuration: { saveTarget: "/Reports" },
          }),
          step({ id: "f", type: "notify", name: "通知", order: 5 }),
        ],
      },
      {
        id: "s2_receipt",
        name: "レシート家計簿",
        steps: [
          step({ id: "a", type: "vision_analysis", name: "OCR", order: 0 }),
          step({ id: "b", type: "excel_generate", name: "家計簿", order: 1 }),
          step({ id: "c", type: "notify", name: "通知", order: 2 }),
        ],
      },
      {
        id: "s3_x",
        name: "X定期投稿",
        steps: [
          step({
            id: "a",
            type: "orchestrate",
            name: "投稿案",
            order: 0,
          }),
          step({
            id: "b",
            type: "x_post",
            name: "X投稿",
            order: 1,
            configuration: { text: "本日のひとこと" },
            requiresApproval: true,
          }),
        ],
      },
      {
        id: "s4_wp",
        name: "WordPress記事",
        steps: [
          step({ id: "a", type: "word_generate", name: "下書き", order: 0 }),
          step({
            id: "b",
            type: "wordpress",
            name: "WP保存",
            order: 1,
            requiresApproval: true,
          }),
        ],
      },
      {
        id: "s5_gmail",
        name: "Gmail下書き",
        steps: [
          step({ id: "a", type: "orchestrate", name: "整理", order: 0 }),
          step({
            id: "b",
            type: "gmail",
            name: "下書き",
            order: 1,
            configuration: { to: "boss@example.com" },
          }),
        ],
      },
      {
        id: "s6_gcal",
        name: "Google Calendar",
        steps: [
          step({
            id: "a",
            type: "google_calendar",
            name: "予定登録",
            order: 0,
            requiresApproval: true,
          }),
        ],
      },
      {
        id: "s7_construction",
        name: "施工報告",
        steps: [
          step({ id: "a", type: "vision_analysis", name: "写真解析", order: 0 }),
          step({ id: "b", type: "word_generate", name: "報告書", order: 1 }),
          step({ id: "c", type: "pdf_generate", name: "PDF", order: 2 }),
          step({
            id: "d",
            type: "dropbox",
            name: "保存",
            order: 3,
            configuration: { saveTarget: "/現場" },
          }),
        ],
      },
    ];

    for (const scenario of externalScenarios) {
      if (!hasLiveExternal()) {
        pushEvidence({
          scenarioId: scenario.id,
          verdict: "blocked",
          reason:
            "AUTOMATION_E2E_LIVE_EXTERNAL!=true または外部認証情報なし — 外部実行を成功扱いにしない",
        });
        continue;
      }
      pushEvidence({
        scenarioId: scenario.id,
        verdict: "fail",
        reason: "ライブ外部実行フラグはONだが、この環境に認証情報がありません",
      });
    }

    // -------- Scenario 8: needs_input → resume --------
    {
      const auto = await createAutomation("入力不足E2E", {
        workflow: workflow([
          step({ id: "a", type: "excel_generate", name: "Excel", order: 0 }),
          step({
            id: "b",
            type: "gmail",
            name: "メール",
            order: 1,
            configuration: {},
          }),
        ]),
        executionPolicy: { mode: "run_then_notify" },
      });
      const invoker = createControlledInvoker({
        externalBehavior: { gmail: "needs_input" },
      });
      const { run } = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "manual",
        context: ownerContext,
        dispatch: false,
      });
      // High-risk Gmail forces approval before any step runs.
      expect(run.status).toBe("awaiting_approval");
      const approved = await automationPlatformService.approveRun(
        "user_e2e",
        run.id,
        ownerContext,
        { dispatch: false },
      );
      await dispatchAutomationRuns({ runIds: [approved.id], invoker });
      const waiting = await automationPlatformService.getRun(
        "user_e2e",
        run.id,
        ownerContext,
      );
      expect(waiting.status).toBe("needs_input");
      const resumed = await automationPlatformService.resumeRunAfterInput(
        "user_e2e",
        run.id,
        ownerContext,
        { to: "boss@example.com" },
        { dispatch: false },
      );
      // After resume, dispatch with controlled success for gmail (mechanics only)
      await dispatchAutomationRuns({
        runIds: [resumed.id],
        invoker: createControlledInvoker({
          externalBehavior: { gmail: "controlled_success" },
        }),
      });
      const final = await automationPlatformService.getRun(
        "user_e2e",
        run.id,
        ownerContext,
      );
      // resume continues same run id
      const ok =
        final.status === "succeeded" || final.status === "partially_succeeded";
      pushEvidence({
        scenarioId: "s8_needs_input",
        automationId: auto.id,
        runId: final.id,
        diagnosticId: final.diagnosticId,
        verdict: ok ? "pass" : "fail",
        reason: ok
          ? "needs_input→入力→途中再開（controlled_externalタグ付き）"
          : `status=${final.status}`,
        artifactIds: final.artifacts.map((a) => a.id),
        estimatedUsd: recordAutomationRunCost({
          runId: final.id,
          automationId: auto.id,
          userId: "user_e2e",
          steps: final.steps.map((s) =>
            estimateStepCost({
              stepId: s.id,
              capabilityId: s.capabilityId,
              ok: s.status === "succeeded",
            }),
          ),
        }).totals.estimatedUsd,
      });
      expect(ok).toBe(true);
    }

    // -------- Scenario 9: partial success + step retry --------
    {
      const auto = await createAutomation("一部成功E2E", {
        workflow: workflow([
          step({ id: "a", type: "excel_generate", name: "Excel", order: 0 }),
          step({ id: "b", type: "pdf_generate", name: "PDF", order: 1 }),
          step({
            id: "c",
            type: "dropbox",
            name: "Dropbox",
            order: 2,
            configuration: { saveTarget: "/x" },
          }),
        ]),
        executionPolicy: { mode: "run_then_notify" },
      });
      const failInvoker = createControlledInvoker({
        externalBehavior: { dropbox: "fail" },
      });
      const { run } = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "manual",
        context: ownerContext,
        dispatch: false,
      });
      await dispatchAutomationRuns({ runIds: [run.id], invoker: failInvoker });
      const failed = await automationPlatformService.getRun(
        "user_e2e",
        run.id,
        ownerContext,
      );
      expect(["failed", "partially_succeeded", "needs_input"]).toContain(
        failed.status,
      );
      const keptArtifacts = failed.artifacts.length;
      expect(keptArtifacts).toBeGreaterThan(0);
      const retried = await automationPlatformService.retryRunSafe(
        "user_e2e",
        run.id,
        ownerContext,
        { mode: "failed_only", stepId: "c", dispatch: false },
      );
      await dispatchAutomationRuns({
        runIds: [retried.id],
        invoker: createControlledInvoker({
          externalBehavior: { dropbox: "controlled_success" },
        }),
      });
      const after = await automationPlatformService.getRun(
        "user_e2e",
        retried.id,
        ownerContext,
      );
      const excelSkippedOrKept = after.steps.find((s) => s.id === "a");
      pushEvidence({
        scenarioId: "s9_partial_retry",
        automationId: auto.id,
        runId: after.id,
        diagnosticId: after.diagnosticId,
        artifactIds: after.artifacts.map((a) => a.id),
        verdict:
          after.status === "succeeded" && keptArtifacts > 0 ? "pass" : "fail",
        reason: `partial→retry dropbox only; excel=${excelSkippedOrKept?.status}`,
      });
      expect(after.status).toBe("succeeded");
    }

    // -------- Scenario 10: Memory resolve + explicit override priority --------
    {
      const auto = await createAutomation("Memory E2E", {
        workflow: workflow([
          step({ id: "a", type: "word_generate", name: "文書", order: 0 }),
        ]),
        instruction: {
          structuredOptions: { tone: "explicit_override" },
          freeformNotes: "今回は簡潔に",
        },
        memoryPolicy: {
          enabled: true,
          allowedScopes: ["writing_style"],
          deniedScopes: [],
          lockedOverrides: { tone: "locked" },
        },
      });
      const { run } = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "manual",
        context: ownerContext,
        dispatch: false,
      });
      await dispatchAutomationRuns({
        runIds: [run.id],
        invoker: createControlledInvoker(),
      });
      const done = await automationPlatformService.getRun(
        "user_e2e",
        run.id,
        ownerContext,
      );
      const used = done.memoryUsage.used.length > 0;
      const noUnauthorizedUpdate = done.memoryUsage.updated.length === 0;
      pushEvidence({
        scenarioId: "s10_memory",
        automationId: auto.id,
        runId: done.id,
        diagnosticId: done.diagnosticId,
        verdict: used && noUnauthorizedUpdate ? "pass" : "fail",
        reason: `memoryUsed=${used} unauthorizedUpdate=${!noUnauthorizedUpdate}`,
      });
      expect(used).toBe(true);
      expect(noUnauthorizedUpdate).toBe(true);
    }

    // -------- Approval E2E: high-risk not executed before approve --------
    {
      let xExecuted = false;
      const spyInvoker = createControlledInvoker({
        externalBehavior: { x_post: "controlled_success" },
      });
      const wrapped: typeof spyInvoker = async (input) => {
        if (input.step.type === "x_post") xExecuted = true;
        return spyInvoker(input);
      };
      const auto = await createAutomation("承認E2E", {
        executionPolicy: { mode: "review_before_run" },
        workflow: workflow([
          step({
            id: "x",
            type: "x_post",
            name: "X",
            order: 0,
            configuration: { text: "承認前は実行禁止" },
          }),
        ]),
      });
      const { run } = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "manual",
        context: ownerContext,
        dispatch: false,
      });
      await dispatchAutomationRuns({ runIds: [run.id], invoker: wrapped });
      expect(xExecuted).toBe(false);
      expect(
        (await automationPlatformService.getRun("user_e2e", run.id, ownerContext))
          .status,
      ).toBe("awaiting_approval");

      // double approve protection via invalid transition after first
      const approved = await automationPlatformService.approveRun(
        "user_e2e",
        run.id,
        ownerContext,
        { dispatch: false },
      );
      await dispatchAutomationRuns({ runIds: [approved.id], invoker: wrapped });
      await expect(
        automationPlatformService.approveRun("user_e2e", run.id, ownerContext),
      ).rejects.toBeTruthy();
      await expect(
        automationPlatformService.approveRun("user_b", run.id, ownerContext),
      ).rejects.toMatchObject({ code: "run_permission_denied" });
      pushEvidence({
        scenarioId: "approval_gate",
        automationId: auto.id,
        runId: run.id,
        verdict: xExecuted ? "pass" : "fail",
        reason: "承認前未実行→承認後実行→二重承認拒否→他ユーザー拒否",
      });
      expect(xExecuted).toBe(true);
    }

    // -------- Schedule accuracy: 100 firings --------
    {
      const auto = await createAutomation("発火100", {
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
        workflow: workflow([
          step({ id: "a", type: "excel_generate", name: "Excel", order: 0 }),
        ]),
        executionPolicy: { mode: "run_then_notify" },
      });
      const delays: number[] = [];
      let duplicates = 0;
      let pauseLeaks = 0;
      const occurrenceKeys = new Set<string>();

      for (let i = 0; i < 100; i += 1) {
        if (i % 40 === 0) resetAutomationRateLimitForTests();
        const scheduledAt = new Date(
          Date.UTC(2026, 0, 1 + i, 0, 0, 0),
        ).toISOString();
        const current = memoryGetAutomation(auto.id)!;
        memoryUpdateAutomation({
          ...current,
          status: "active",
          nextRunAt: scheduledAt,
          updatedAt: new Date().toISOString(),
        });
        const nowMs = Date.parse(scheduledAt) + 250 + (i % 7) * 10;
        const tick = await processDueScheduledAutomationsV2({
          nowMs,
          limit: 5,
          dispatch: false,
        });
        const firing = tick.firings.find((f) => f.automationId === auto.id);
        if (!firing) {
          delays.push(Number.POSITIVE_INFINITY);
          continue;
        }
        delays.push(firing.delayMs);
        if (!firing.created) duplicates += 1;
        if (firing.occurrenceKey) {
          if (occurrenceKeys.has(firing.occurrenceKey)) duplicates += 1;
          occurrenceKeys.add(firing.occurrenceKey);
        }
      }

      // pause mid-way should not fire
      const paused = await automationPlatformService.pause(
        "user_e2e",
        auto.id,
        ownerContext,
      );
      expect(paused.automation.status).toBe("paused");
      memoryUpdateAutomation({
        ...memoryGetAutomation(auto.id)!,
        nextRunAt: new Date(Date.UTC(2026, 6, 1, 0, 0, 0)).toISOString(),
      });
      const pauseTick = await processDueScheduledAutomationsV2({
        nowMs: Date.UTC(2026, 6, 1, 0, 1, 0),
        dispatch: false,
      });
      pauseLeaks = pauseTick.firings.filter((f) => f.automationId === auto.id)
        .length;

      const finite = delays.filter((d) => Number.isFinite(d));
      const fireRate = finite.length / 100;
      const avg =
        finite.reduce((s, d) => s + d, 0) / Math.max(1, finite.length);
      const p95 = percentile(finite, 95);
      const p99 = percentile(finite, 99);

      pushEvidence({
        scenarioId: "schedule_100",
        automationId: auto.id,
        verdict:
          fireRate >= 0.99 && duplicates === 0 && pauseLeaks === 0
            ? "pass"
            : "fail",
        reason: JSON.stringify({
          fireRate,
          avgDelayMs: avg,
          p95,
          p99,
          maxDelayMs: Math.max(...finite),
          duplicates,
          pauseLeaks,
          uniqueOccurrences: occurrenceKeys.size,
        }),
      });
      expect(fireRate).toBeGreaterThanOrEqual(0.99);
      expect(duplicates).toBe(0);
      expect(pauseLeaks).toBe(0);
    }

    // -------- Idempotency: same occurrence --------
    {
      const auto = await createAutomation("idempotency", {
        workflow: workflow([
          step({ id: "a", type: "excel_generate", name: "Excel", order: 0 }),
        ]),
      });
      const when = "2026-08-01T09:00:00.000Z";
      const a = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "schedule",
        scheduledFor: when,
        context: ownerContext,
        dispatch: false,
      });
      const b = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "schedule",
        scheduledFor: when,
        context: ownerContext,
        dispatch: false,
      });
      pushEvidence({
        scenarioId: "idempotency_occurrence",
        automationId: auto.id,
        runId: a.run.id,
        occurrenceKey: a.run.scheduleOccurrenceKey,
        verdict: a.run.id === b.run.id && b.created === false ? "pass" : "fail",
      });
      expect(a.run.id).toBe(b.run.id);
      expect(b.created).toBe(false);
    }

    // -------- Pause / resume / cancel --------
    {
      const auto = await createAutomation("lifecycle", {
        workflow: workflow([
          step({ id: "a", type: "excel_generate", name: "Excel", order: 0 }),
          step({ id: "b", type: "pdf_generate", name: "PDF", order: 1 }),
        ]),
      });
      await automationPlatformService.pause("user_e2e", auto.id, ownerContext);
      await expect(
        automationPlatformService.enqueueRun({
          userId: "user_e2e",
          automationId: auto.id,
          triggerType: "manual",
          context: ownerContext,
          dispatch: false,
        }),
      ).rejects.toBeTruthy();
      const resumed = await automationPlatformService.resume(
        "user_e2e",
        auto.id,
        ownerContext,
      );
      expect(resumed.nextRunAt).toBeTruthy();
      const { run } = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "manual",
        context: ownerContext,
        dispatch: false,
      });
      const cancelled = await automationPlatformService.cancelRun(
        "user_e2e",
        run.id,
        ownerContext,
        { reason: "E2E cancel" },
      );
      pushEvidence({
        scenarioId: "pause_resume_cancel",
        automationId: auto.id,
        runId: cancelled.id,
        verdict: cancelled.status === "cancelled" ? "pass" : "fail",
      });
      expect(cancelled.status).toBe("cancelled");
    }

    // -------- Security: cross-user --------
    {
      const auto = await createAutomation("security", {
        workflow: workflow([
          step({ id: "a", type: "excel_generate", name: "Excel", order: 0 }),
        ]),
      });
      const { run } = await automationPlatformService.enqueueRun({
        userId: "user_e2e",
        automationId: auto.id,
        triggerType: "manual",
        context: ownerContext,
        dispatch: false,
      });
      await expect(
        automationPlatformService.getRun("attacker", run.id, ownerContext),
      ).rejects.toMatchObject({ code: "run_permission_denied" });
      await expect(
        automationPlatformService.retryRun("attacker", run.id, ownerContext),
      ).rejects.toMatchObject({ code: "run_permission_denied" });
      await expect(
        automationPlatformService.cancelRun("attacker", run.id, ownerContext),
      ).rejects.toMatchObject({ code: "run_permission_denied" });
      await expect(
        automationPlatformService.getRunByDiagnosticId(
          "attacker",
          run.diagnosticId,
          ownerContext,
        ),
      ).rejects.toMatchObject({ code: "run_not_found" });
      pushEvidence({
        scenarioId: "security_isolation",
        runId: run.id,
        diagnosticId: run.diagnosticId,
        verdict: "pass",
      });
    }

    // -------- Compressed endurance + concurrency bands --------
    // Note: in-memory structuredClone store OOMs well below long-lived 1000-run
    // retention; we execute 1000 enqueue+dispatch cycles while reclaiming runs,
    // and separately measure concurrency bands 5/10/20.
    {
      // Mechanics endurance uses fast Production control/notify steps.
      // Heavy Word/Excel/PDF generation is covered in dedicated fail-closed tests.
      const auto = await createAutomation("endurance", {
        workflow: workflow([
          step({
            id: "a",
            type: "wait",
            name: "待機",
            order: 0,
            configuration: { durationMs: 0 },
          }),
          step({
            id: "b",
            type: "notify",
            name: "通知",
            order: 1,
            configuration: { title: "endurance", message: "ok" },
          }),
        ]),
        executionPolicy: { mode: "run_then_notify" },
      });
      const invoker = createControlledInvoker();
      let succeeded = 0;
      let failed = 0;
      const durations: number[] = [];
      const runIds = new Set<string>();
      let stuckSeen = 0;

      for (let i = 0; i < 1000; i += 1) {
        if (i % 25 === 0) {
          resetAutomationRateLimitForTests();
          resetAutomationAuditLogForTests();
        }
        const { run, created } = await automationPlatformService.enqueueRun({
          userId: "user_e2e",
          automationId: auto.id,
          triggerType: "manual",
          clientIdempotencyKey: `endurance:solo:${i}`,
          context: ownerContext,
          dispatch: false,
        });
        if (!created) continue;
        if (runIds.has(run.id)) throw new Error("duplicate run id");
        runIds.add(run.id);
        const t0 = Date.now();
        const result = await dispatchAutomationRuns({
          runIds: [run.id],
          invoker,
        });
        durations.push(Date.now() - t0);
        succeeded += result.succeeded;
        failed += result.failed;
        const latest = await automationPlatformService.getRun(
          "user_e2e",
          run.id,
          ownerContext,
        );
        if (["running", "queued", "retrying"].includes(latest.status)) {
          stuckSeen += 1;
        }
        if (i % 20 === 0) {
          recordAutomationRunCost({
            runId: latest.id,
            automationId: auto.id,
            userId: "user_e2e",
            steps: latest.steps.map((s) =>
              estimateStepCost({
                stepId: s.id,
                capabilityId: s.capabilityId,
                ok: s.status === "succeeded",
              }),
            ),
          });
        }
        memoryDeleteRunForTests(run.id);
      }

      const concurrency: Record<string, { ok: number; total: number }> = {};
      for (const width of [5, 10, 20]) {
        resetAutomationRateLimitForTests();
        const ids: string[] = [];
        for (let j = 0; j < width; j += 1) {
          const { run, created } = await automationPlatformService.enqueueRun({
            userId: "user_e2e",
            automationId: auto.id,
            triggerType: "manual",
            clientIdempotencyKey: `endurance:c${width}:${j}`,
            context: ownerContext,
            dispatch: false,
          });
          if (created) ids.push(run.id);
        }
        const result = await dispatchAutomationRuns({ runIds: ids, invoker });
        concurrency[`c${width}`] = {
          ok: result.succeeded,
          total: ids.length,
        };
        for (const id of ids) memoryDeleteRunForTests(id);
      }

      const total = succeeded + failed;
      const successRate = succeeded / Math.max(1, total);
      pushEvidence({
        scenarioId: "endurance_1000_compressed",
        automationId: auto.id,
        verdict:
          total >= 1000 && successRate >= 0.99 && stuckSeen === 0
            ? "pass"
            : "fail",
        reason: JSON.stringify({
          total,
          succeeded,
          failed,
          successRate,
          stuck: stuckSeen,
          uniqueRuns: runIds.size,
          p95RunMs: percentile(durations, 95),
          p99RunMs: percentile(durations, 99),
          concurrency,
          note: "wall-clock 24h not executed; compressed in-process; runs reclaimed to avoid structuredClone OOM",
        }),
      });
      expect(total).toBeGreaterThanOrEqual(1000);
      expect(successRate).toBeGreaterThanOrEqual(0.99);
      expect(stuckSeen).toBe(0);
    }

    // -------- Write evidence report --------
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const costSummary = summarizeAutomationCosts(listAutomationRunCosts());
    const report = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      environment: {
        node: process.version,
        liveExternal: hasLiveExternal(),
        hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
        hasGoogle: Boolean(process.env.GOOGLE_CLIENT_ID),
        hasX: Boolean(process.env.X_CLIENT_ID || process.env.X_TEST_ACCESS_TOKEN),
        hasDropbox: Boolean(process.env.DROPBOX_APP_KEY || process.env.DROPBOX_CLIENT_ID),
      },
      evidence,
      costSummary,
      notificationsCreated: vi.mocked(createNotification).mock.calls.length,
      passCount: evidence.filter((e) => e.verdict === "pass").length,
      failCount: evidence.filter((e) => e.verdict === "fail").length,
      blockedCount: evidence.filter((e) => e.verdict === "blocked").length,
    };
    writeFileSync(
      join(ARTIFACTS_DIR, "e2e-report.json"),
      JSON.stringify(report, null, 2),
    );

    // Major external scenarios must not be falsely passed
    expect(
      evidence.filter(
        (e) =>
          e.scenarioId.startsWith("s1_") ||
          e.scenarioId.startsWith("s3_") ||
          e.scenarioId.startsWith("s5_"),
      ).every((e) => e.verdict !== "pass"),
    ).toBe(true);
  },
    600_000,
  );
});
