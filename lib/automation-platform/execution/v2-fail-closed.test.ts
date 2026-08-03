/**
 * V2 stub-elimination / fail-closed gates.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
    notificationId: "ntf_test_1",
  })),
}));

import { resetAutomationAuditLogForTests } from "@/lib/automation-platform/audit/log";
import { defaultStepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import {
  evaluateRunCompletion,
  runCompletionUserMessage,
} from "@/lib/automation-platform/execution/run-completion";
import {
  listProductionStepTypes,
  NON_PRODUCTION_CAPABILITY_IDS,
  validateStepsForProductionActivation,
} from "@/lib/automation-platform/execution/production-step-registry";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import { resetAutomationPlatformStoreForTests } from "@/lib/automation-platform/repository/memory-store";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import { createNotification } from "@/lib/notifications/service";
import { getStoredDeliverable } from "@/lib/deliverables/store";

const ownerContext = buildFeatureAccessContext("owner@example.com");

function enableFlags(): void {
  setFeatureFlagState("automation_v2_enabled", "on");
  setFeatureFlagState("automation_memory_enabled", "on");
  setFeatureFlagState("automation_approval_enabled", "on");
}

function workflow(
  steps: CreateAutomationV2Input["workflow"]["steps"],
): CreateAutomationV2Input["workflow"] {
  return {
    version: 1,
    steps,
    onFailure: { strategy: "stop", notify: true },
    timeoutPolicy: {
      workflowTimeoutMs: 60_000,
      stepDefaultTimeoutMs: 10_000,
    },
  };
}

function baseStep(
  partial: Partial<CreateAutomationV2Input["workflow"]["steps"][number]> &
    Pick<
      CreateAutomationV2Input["workflow"]["steps"][number],
      "id" | "type" | "name" | "order"
    >,
): CreateAutomationV2Input["workflow"]["steps"][number] {
  return {
    id: partial.id,
    type: partial.type,
    name: partial.name,
    order: partial.order,
    inputBindings: partial.inputBindings ?? {},
    configuration: partial.configuration ?? {},
    requiresApproval: partial.requiresApproval ?? false,
    retryPolicy: partial.retryPolicy ?? { maxAttempts: 1, backoffMs: [] },
    timeoutMs: partial.timeoutMs ?? 10_000,
    onSuccess: partial.onSuccess ?? null,
    onFailure: partial.onFailure ?? null,
    enabled: partial.enabled ?? true,
  };
}

describe("V2 Production fail-closed", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    enableFlags();
    vi.mocked(createNotification).mockClear();
  });

  it("defaultStepInvoker never succeeds", async () => {
    for (const type of [
      "word_generate",
      "excel_generate",
      "ocr",
      "vision_analysis",
      "gmail",
      "orchestrate",
      "data_extract",
    ] as const) {
      const result = await defaultStepInvoker({
        step: baseStep({
          id: "s",
          type,
          name: type,
          order: 0,
        }),
        userId: "u1",
        automationName: "t",
        runId: "r1",
        approved: true,
      });
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("step_not_implemented");
      expect(result.failedStage).toBe("STEP_DISPATCH");
      expect(result.retryable).toBe(false);
    }
  });

  it("unregistered production steps are rejected at activation", async () => {
    await expect(
      automationPlatformService.create(
        "user_fc",
        {
          name: "未実装有効化",
          status: "active",
          trigger: {
            type: "manual",
            timezone: "Asia/Tokyo",
            schedule: null,
            event: null,
            condition: null,
          },
          workflow: workflow([
            baseStep({
              id: "a",
              type: "data_extract",
              name: "抽出",
              order: 0,
            }),
          ]),
          executionPolicy: { mode: "run_then_notify" },
        },
        ownerContext,
      ),
    ).rejects.toMatchObject({ code: "automation_unsupported_step" });
  });

  it("Word/Excel/PDF/PowerPoint produce real stored artifacts", async () => {
    const automation = await automationPlatformService.create(
      "user_fc",
      {
        name: "成果物本接続",
        status: "active",
        trigger: {
          type: "manual",
          timezone: "Asia/Tokyo",
          schedule: null,
          event: null,
          condition: null,
        },
        workflow: workflow([
          baseStep({
            id: "w",
            type: "word_generate",
            name: "Word",
            order: 0,
            configuration: {
              title: "週次報告",
              content: "本日の進捗をまとめます。\n- 項目A\n- 項目B",
            },
          }),
          baseStep({
            id: "e",
            type: "excel_generate",
            name: "Excel",
            order: 1,
            configuration: {
              title: "数値",
              content: "項目,値\n売上,100\n原価,40",
            },
          }),
          baseStep({
            id: "p",
            type: "pdf_generate",
            name: "PDF",
            order: 2,
            configuration: {
              title: "PDF報告",
              content: [
                "# PDF報告",
                "",
                "本資料は自動化によるPDF生成の検証用です。",
                "十分な本文量を確保し、品質検証を通過させます。",
                "",
                "## 進捗",
                "- 項目Aの詳細を記載します。",
                "- 項目Bの詳細を記載します。",
                "",
                "以上です。",
              ].join("\n"),
            },
          }),
          baseStep({
            id: "t",
            type: "powerpoint_generate",
            name: "PPT",
            order: 3,
            configuration: {
              title: "説明資料",
              content: [
                "# 説明資料",
                "",
                "## 背景",
                "本スライドは自動化経路の検証用です。",
                "",
                "## 要点",
                "- 要点Aを説明します",
                "- 要点Bを説明します",
                "- 要点Cを説明します",
              ].join("\n"),
            },
          }),
        ]),
        executionPolicy: { mode: "run_then_notify" },
      },
      ownerContext,
    );

    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_fc",
      automationId: automation.id,
      triggerType: "manual",
      context: ownerContext,
    });

    expect(run.status).toBe("succeeded");
    expect(run.completionEvidence).toBeTruthy();
    expect(run.completionEvidence?.artifactIds.length).toBeGreaterThan(0);
    expect(run.artifacts.every((item) => Boolean(item.url))).toBe(true);
    for (const art of run.artifacts) {
      const stored = getStoredDeliverable(art.id);
      expect(stored).toBeTruthy();
      expect(stored!.buffer.byteLength).toBeGreaterThan(0);
      expect(stored!.isPlaceholder).toBe(false);
      expect(stored!.userId).toBe("user_fc");
    }
  });

  it("gmail live adapter fails closed without connection (no prepared success)", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
    const result = await strictStepInvoker({
      step: baseStep({
        id: "g",
        type: "gmail",
        name: "Gmail",
        order: 0,
        configuration: {
          mode: "draft",
          to: "boss@example.com",
          subject: "hello",
          textBody: "body",
        },
        requiresApproval: true,
      }),
      userId: "user_fc",
      automationName: "mail",
      runId: "r_mail",
      approved: true,
    });
    expect(result.ok).toBe(false);
    expect(
      [
        "gmail_not_connected",
        "gmail_reconnect_required",
        "gmail_missing_scope",
        "automation_integration_required",
      ].includes(result.errorCode ?? ""),
    ).toBe(true);
    expect(result.failedStage).toBe("EXTERNAL_ADAPTER_EXECUTION");
  });

  it("partially_succeeded notification is not type=completed", () => {
    const run = {
      id: "run_partial",
      automationId: "auto_1",
      status: "partially_succeeded",
    } as AutomationRun;

    notifyAutomationRunEvent({
      userId: "user_fc",
      automationName: "一部",
      run,
      policy: {
        beforeRun: false,
        onSuccess: true,
        onFailure: true,
        onNeedsInput: true,
        channels: ["in_app"],
      },
      event: "partially_succeeded",
    });

    expect(createNotification).toHaveBeenCalled();
    const arg = vi.mocked(createNotification).mock.calls.at(-1)?.[0];
    expect(arg?.type).toBe("awaiting_review");
    expect(arg?.type).not.toBe("completed");
    expect(String(arg?.title)).toContain("一部完了");
  });

  it("evaluateRunCompletion forbids cancelled and required skipped", () => {
    const cancelled = evaluateRunCompletion({
      run: {
        id: "r",
        status: "cancelled",
        failedStepId: null,
        steps: [],
        artifacts: [],
      } as unknown as AutomationRun,
      workflowSteps: [],
      artifacts: [],
      evidence: null,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(cancelled.runStatus).toBe("failed");
    expect(cancelled.reason).toBe("cancelled_run_cannot_complete");

    const skippedRequired = evaluateRunCompletion({
      run: {
        id: "r2",
        status: "running",
        failedStepId: null,
        steps: [
          {
            id: "s1",
            capabilityId: "excel_generate",
            name: "Excel",
            order: 0,
            status: "skipped",
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
      } as unknown as AutomationRun,
      workflowSteps: [
        baseStep({
          id: "s1",
          type: "excel_generate",
          name: "Excel",
          order: 0,
          enabled: true,
        }),
      ],
      artifacts: [],
      evidence: null,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(skippedRequired.runStatus).toBe("failed");
    expect(skippedRequired.missingEvidence.some((m) => m.includes("required_skipped"))).toBe(
      true,
    );
  });

  it("user copy maps completed / partial / failed correctly", () => {
    expect(runCompletionUserMessage("completed")).toBe("仕事が完了しました");
    expect(runCompletionUserMessage("partially_completed")).toContain("一部完了");
    expect(runCompletionUserMessage("failed")).toBe("完了できませんでした");
    expect(runCompletionUserMessage("waiting")).toContain("確認待ち");
  });

  it("production registry excludes non-production capability ids", () => {
    const production = new Set(listProductionStepTypes());
    for (const id of NON_PRODUCTION_CAPABILITY_IDS) {
      expect(production.has(id)).toBe(false);
    }
    const issues = validateStepsForProductionActivation([
      { id: "a", type: "orchestrate", enabled: true },
      { id: "b", type: "excel_generate", enabled: true },
    ]);
    expect(issues.some((i) => i.stepType === "orchestrate")).toBe(true);
    expect(issues.some((i) => i.stepType === "excel_generate")).toBe(false);
  });

  it("regenerate keeps parent and creates new revision artifact", async () => {
    const first = await automationPlatformService.create(
      "user_fc",
      {
        name: "初回Word",
        status: "active",
        trigger: {
          type: "manual",
          timezone: "Asia/Tokyo",
          schedule: null,
          event: null,
          condition: null,
        },
        workflow: workflow([
          baseStep({
            id: "w",
            type: "word_generate",
            name: "Word",
            order: 0,
            configuration: {
              title: "原版",
              content: "原版の本文です。",
            },
          }),
        ]),
        executionPolicy: { mode: "run_then_notify" },
      },
      ownerContext,
    );
    const { run: run1 } = await automationPlatformService.enqueueRun({
      userId: "user_fc",
      automationId: first.id,
      triggerType: "manual",
      context: ownerContext,
    });
    expect(run1.status).toBe("succeeded");
    const parentId = run1.artifacts[0]!.id;
    expect(getStoredDeliverable(parentId)).toBeTruthy();

    const regen = await automationPlatformService.create(
      "user_fc",
      {
        name: "再生成",
        status: "active",
        trigger: {
          type: "manual",
          timezone: "Asia/Tokyo",
          schedule: null,
          event: null,
          condition: null,
        },
        workflow: workflow([
          baseStep({
            id: "w2",
            type: "word_generate",
            name: "Word再生成",
            order: 0,
            configuration: {
              mode: "regenerate",
              parentDeliverableId: parentId,
              revisionInstruction: "より簡潔にしてください。",
            },
          }),
        ]),
        executionPolicy: { mode: "run_then_notify" },
      },
      ownerContext,
    );
    const { run: run2 } = await automationPlatformService.enqueueRun({
      userId: "user_fc",
      automationId: regen.id,
      triggerType: "manual",
      context: ownerContext,
    });
    expect(run2.status).toBe("succeeded");
    const newId = run2.artifacts[0]!.id;
    expect(newId).not.toBe(parentId);
    expect(getStoredDeliverable(parentId)).toBeTruthy();
    expect(getStoredDeliverable(newId)).toBeTruthy();
    expect(getStoredDeliverable(newId)!.metadata?.parentDeliverableId).toBe(
      parentId,
    );
  });

  it("vision/ocr without attachment fail closed (not mock success)", async () => {
    const vision = await strictStepInvoker({
      step: baseStep({
        id: "v",
        type: "vision_analysis",
        name: "Vision",
        order: 0,
      }),
      userId: "user_fc",
      automationName: "v",
      runId: "r_v",
      approved: true,
    });
    expect(vision.ok).toBe(false);
    expect(vision.needsUserInput).toBe(true);

    const ocr = await strictStepInvoker({
      step: baseStep({
        id: "o",
        type: "ocr",
        name: "OCR",
        order: 0,
      }),
      userId: "user_fc",
      automationName: "o",
      runId: "r_o",
      approved: true,
    });
    expect(ocr.ok).toBe(false);
    expect(ocr.failedStage).toBe("OCR_INPUT");
  });
});
