/**
 * Automation Phase 3 — multi-step completion regression + E2E harness.
 *
 * 【ATLAS機能評価】要約: generate→calendar→notify を durable に完走。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "owner@example.com"),
}));
vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));
vi.mock("@/lib/integrations/google/calendar/service", () => ({
  createCalendarEventForUser: vi.fn(),
}));
vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(),
}));

import { createCalendarEventForUser } from "@/lib/integrations/google/calendar/service";
import { createNotification } from "@/lib/notifications/service";
import { parseNaturalLanguageAutomation } from "@/lib/automations/create-from-natural-language";
import { buildV2CreateInputFromNaturalLanguage } from "@/lib/automations/create-external-v2-from-nl";
import { composePhase3WorkflowSteps } from "@/lib/automations/phase3-multistep-compose";
import { ensureRequiredExternalSteps } from "@/lib/automations/ensure-external-steps";
import { classifyAutomationFailure } from "@/lib/automation-platform/execution/failure-class";
import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import { evaluateRunCompletion } from "@/lib/automation-platform/execution/run-completion";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import { prepareStepsForSafeRetry } from "@/lib/automation-platform/operations/idempotency";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { resetSideEffectStoreForTests } from "@/lib/side-effects/store";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { AutomationRun } from "@/lib/automation-platform/types/run";

const PHASE2_CALENDAR_NL =
  "毎日1時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して";
const PHASE3_NL =
  "毎日9時にMINERVOT Phase3テストという文章を作成し、Googleカレンダーに予定を登録して、完了したら通知して";

const createCalendarEventForUserMock = vi.mocked(createCalendarEventForUser);
const createNotificationMock = vi.mocked(createNotification);

function sampleAutomation(steps: AutomationV2["workflow"]["steps"]): AutomationV2 {
  return {
    id: "auto_phase3",
    userId: "user_phase3",
    name: "Phase3 multi-step",
    description: "",
    status: "active",
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: {
        frequency: "daily",
        hour: 9,
        minute: 0,
        cronDerived: null,
        startAt: null,
        endAt: null,
        maxOccurrences: null,
      },
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps,
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 900_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: {
      mode: "review_before_run",
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: [],
      systemHighRiskOverride: true,
    },
    notificationPolicy: {
      beforeRun: false,
      onSuccess: true,
      onFailure: true,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    instruction: {
      freeformNotes: PHASE3_NL,
      structuredOptions: {
        requiredExternals: ["google_calendar"],
        source: "natural_language",
      },
    },
    memoryPolicy: {
      enabled: false,
      allowedScopes: [],
      deniedScopes: [],
      lockedOverrides: {},
    },
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: "2026-08-14T00:00:00.000Z",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  } as unknown as AutomationV2;
}

function sampleRun(automation: AutomationV2): AutomationRun {
  const now = new Date().toISOString();
  return {
    id: "run_phase3",
    automationId: automation.id,
    automationName: automation.name,
    userId: automation.userId,
    status: "queued",
    runKey: "manual:phase3",
    idempotencyKey: "phase3-e2e",
    scheduleOccurrenceKey: "occ_phase3_1",
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
    approval: {
      status: "approved",
      mode: "review_before_run",
      requestedAt: now,
      decidedAt: now,
      decidedByUserId: automation.userId,
      comment: null,
      stepIds: [],
    },
    steps: automation.workflow.steps.map((step, index) => ({
      id: step.id,
      capabilityId: step.type,
      name: step.name,
      order: index,
      status: "pending" as const,
      requiresApproval: Boolean(step.requiresApproval),
      highRisk: Boolean(step.requiresApproval),
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      attemptCount: 0,
      outputSummary: null,
    })),
    artifacts: [],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: "diag_phase3",
    completionEvidence: null,
    memoryReferences: [],
    createdAt: now,
    updatedAt: now,
  } as unknown as AutomationRun;
}

describe("Phase 3 multi-step composition", () => {
  it("Phase 2 calendar-only NL stays single google_calendar step", () => {
    const composed = composePhase3WorkflowSteps({
      sourceText: PHASE2_CALENDAR_NL,
      requiredExternals: ["google_calendar"],
    });
    expect(composed.composition).toBe("calendar_only");
    expect(composed.steps.map((s) => s.type)).toEqual(["google_calendar"]);
  });

  it("Phase 3 NL composes generate → calendar → notify", () => {
    const composed = composePhase3WorkflowSteps({
      sourceText: PHASE3_NL,
      requiredExternals: ["google_calendar"],
    });
    expect(composed.composition).toBe("generate_calendar_notify");
    expect(composed.steps.map((s) => s.type)).toEqual([
      "word_generate",
      "google_calendar",
      "notify",
    ]);
  });

  it("buildV2CreateInputFromNaturalLanguage emits multi-step for Phase 3 NL", () => {
    const parsed = parseNaturalLanguageAutomation(PHASE3_NL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const built = buildV2CreateInputFromNaturalLanguage({
      createInput: parsed.createInput,
      sourceText: parsed.sourceText,
      requiredExternals: parsed.requiredExternals,
    });
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(built.workflow.steps.map((s) => s.type)).toEqual([
      "word_generate",
      "google_calendar",
      "notify",
    ]);
    expect(built.instruction?.structuredOptions?.phase3Composition).toBe(
      "generate_calendar_notify",
    );
  });

  it("ensureRequiredExternalSteps injects generate+notify for Phase 3 NL", () => {
    const ensured = ensureRequiredExternalSteps({
      steps: [],
      sourceText: PHASE3_NL,
      structuredOptions: { requiredExternals: ["google_calendar"] },
    });
    expect(ensured.steps.map((s) => s.type)).toEqual([
      "word_generate",
      "google_calendar",
      "notify",
    ]);
  });

  it("wizard NL propose includes word_generate for 文章を作成", () => {
    const draft = proposeWizardFromNaturalLanguage(PHASE3_NL);
    const types = draft.steps.filter((s) => s.enabled).map((s) => s.type);
    expect(types).toContain("word_generate");
    expect(types).toContain("google_calendar");
    expect(types).toContain("notify");
  });
});

describe("Phase 3 failure class + completion gate", () => {
  it("classifies credential / approval / artifact failures", () => {
    expect(
      classifyAutomationFailure({
        errorCode: "not_connected",
        errorMessage: "reconnect",
      }).failureClass,
    ).toBe("credential_required");
    expect(
      classifyAutomationFailure({
        errorCode: "automation_approval_required",
        failedStage: "APPROVAL",
      }).failureClass,
    ).toBe("approval_required");
    expect(
      classifyAutomationFailure({
        errorCode: "external_action_id_required",
      }).failureClass,
    ).toBe("artifact_failure");
  });

  it("completion gate blocks pending required steps", () => {
    const decision = evaluateRunCompletion({
      run: {
        id: "r1",
        status: "running",
        steps: [
          {
            id: "word_generate",
            capabilityId: "word_generate",
            status: "succeeded",
          },
          {
            id: "google_calendar",
            capabilityId: "google_calendar",
            status: "pending",
          },
        ],
        failedStepId: null,
      } as never,
      workflowSteps: [
        {
          id: "word_generate",
          type: "word_generate",
          enabled: true,
          configuration: {},
        },
        {
          id: "google_calendar",
          type: "google_calendar",
          enabled: true,
          configuration: {},
        },
      ] as never,
      artifacts: [],
      evidence: null,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(decision.runStatus).toBe("failed");
    expect(decision.missingEvidence.some((m) => m.includes("pending"))).toBe(
      true,
    );
  });
});

describe("Phase 3 resume / retry / idempotency", () => {
  it("safe-retry keeps succeeded externals as succeeded (no re-exec)", () => {
    const prepared = prepareStepsForSafeRetry(
      [
        {
          id: "word_generate",
          capabilityId: "word_generate",
          status: "succeeded",
        },
        {
          id: "google_calendar",
          capabilityId: "google_calendar",
          status: "failed",
        },
        {
          id: "notify",
          capabilityId: "notify",
          status: "pending",
        },
      ] as never,
      { mode: "from_failed", failedStepId: "google_calendar" },
    );
    expect(prepared[0]?.status).toBe("succeeded");
    expect(prepared[1]?.status).toBe("pending");
    expect(prepared[2]?.status).toBe("pending");
  });
});

function withAppEnv(run: () => Promise<void>): Promise<void> {
  const prev = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };
  process.env.GOOGLE_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  return run().finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

describe("Phase 3 E2E generate → calendar → notify", () => {
  beforeEach(() => {
    resetSideEffectStoreForTests();
    resetFeatureFlagStore();
    setFeatureFlagState("automation_v2_enabled", "on");
    setFeatureFlagState("google", "on");
    createCalendarEventForUserMock.mockReset();
    createNotificationMock.mockReset();
    createCalendarEventForUserMock.mockResolvedValue({
      status: "ready",
      event: {
        id: "evt_phase3_e2e_1",
        title: "MINERVOT Phase3テスト",
        htmlLink: "https://calendar.google.com/event?eid=evt_phase3_e2e_1",
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 3600_000).toISOString(),
        location: null,
        isAllDay: false,
        description: null,
        meetLink: null,
      },
    } as never);
    createNotificationMock.mockResolvedValue({
      notificationId: "ntf_phase3_e2e_1",
    } as never);
  });

  it("runs all steps in order with durable evidence (no skip)", async () => {
    await withAppEnv(async () => {
      const composed = composePhase3WorkflowSteps({
        sourceText: PHASE3_NL,
        requiredExternals: ["google_calendar"],
      });
      // Calendar step is high-risk; mark requiresApproval false in unit E2E so
      // the sequential path is exercised after pre-run approval already granted.
      const steps = composed.steps.map((step) =>
        step.type === "google_calendar"
          ? { ...step, requiresApproval: false }
          : step,
      );
      const automation = sampleAutomation(steps);
      const run = sampleRun(automation);

      const result = await executeQueuedRun({
        run,
        automation,
        invoker: strictStepInvoker,
      });

      expect(result.run.status).toBe("succeeded");
      expect(result.terminal).toBe(true);
      expect(result.run.steps.map((s) => s.capabilityId)).toEqual([
        "word_generate",
        "google_calendar",
        "notify",
      ]);
      expect(result.run.steps.every((s) => s.status === "succeeded")).toBe(true);
      expect(result.run.steps.every((s) => s.startedAt && s.completedAt)).toBe(
        true,
      );
      expect(createCalendarEventForUserMock).toHaveBeenCalledTimes(1);
      expect(createNotificationMock).toHaveBeenCalledTimes(1);
      expect(result.run.completionEvidence?.externalActionIds).toContain(
        "evt_phase3_e2e_1",
      );
      expect(result.run.completionEvidence?.notificationIds).toContain(
        "ntf_phase3_e2e_1",
      );
      expect(
        result.run.completionEvidence?.artifactIds.length,
      ).toBeGreaterThan(0);
      expect(result.run.completionEvidence?.completionHash).toBeTruthy();

      const retryPrepared = prepareStepsForSafeRetry(result.run.steps, {
        mode: "full",
        failedStepId: null,
      });
      expect(
        retryPrepared.filter((s) => s.capabilityId === "google_calendar")[0]
          ?.status,
      ).toBe("succeeded");
    });
  });

  it("does not mark later steps succeeded when calendar fails", async () => {
    await withAppEnv(async () => {
      createCalendarEventForUserMock.mockResolvedValue({
        status: "error",
        message: "Google API failed",
      } as never);
      const steps = composePhase3WorkflowSteps({
        sourceText: PHASE3_NL,
        requiredExternals: ["google_calendar"],
      }).steps.map((step) =>
        step.type === "google_calendar"
          ? { ...step, requiresApproval: false }
          : step,
      );
      const automation = sampleAutomation(steps);
      const result = await executeQueuedRun({
        run: sampleRun(automation),
        automation,
        invoker: strictStepInvoker,
      });
      // Retryable external failures schedule retry; still must not advance notify.
      expect(["failed", "retrying"]).toContain(result.run.status);
      expect(
        result.run.steps.find((s) => s.capabilityId === "word_generate")
          ?.status,
      ).toBe("succeeded");
      expect(
        result.run.steps.find((s) => s.capabilityId === "google_calendar")
          ?.status,
      ).toBe("failed");
      expect(
        result.run.steps.find((s) => s.capabilityId === "notify")?.status,
      ).toBe("pending");
      expect(createNotificationMock).not.toHaveBeenCalled();
    });
  });

  it("await_approval control step resumes after approved=true", async () => {
    await withAppEnv(async () => {
      const base = composePhase3WorkflowSteps({
        sourceText: PHASE3_NL,
        requiredExternals: ["google_calendar"],
      }).steps.map((step) =>
        step.type === "google_calendar"
          ? { ...step, requiresApproval: false }
          : step,
      );
      const steps = [
        base[0]!,
        {
          id: "await_approval",
          type: "await_approval" as const,
          name: "承認",
          order: 1,
          inputBindings: {},
          configuration: {},
          requiresApproval: true,
          retryPolicy: { maxAttempts: 1, backoffMs: [0] },
          timeoutMs: 60_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
        ...base.slice(1).map((step, index) => ({ ...step, order: index + 2 })),
      ];
      const automation = sampleAutomation(steps as never);

      const approvedRun = sampleRun(automation);
      const finished = await executeQueuedRun({
        run: approvedRun,
        automation,
        invoker: strictStepInvoker,
      });
      expect(finished.run.status).toBe("succeeded");
      expect(
        finished.run.steps.find((s) => s.capabilityId === "await_approval")
          ?.status,
      ).toBe("succeeded");
    });
  });
});
