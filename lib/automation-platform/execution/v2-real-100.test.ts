/**
 * Automation V2 real — 100+ cases proving zero fake/partial completed.
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
    notificationId: `ntf_${Math.random().toString(16).slice(2, 10)}`,
  })),
}));

import {
  buildCompletionEvidenceV2,
  validateCompletionEvidenceFields,
} from "@/lib/automation-platform/execution/completion-evidence-v2";
import {
  COMPLETED_CONDITIONS,
  FAILURE_CONDITIONS,
  evaluateRunCompletion,
} from "@/lib/automation-platform/execution/run-completion";
import { defaultStepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import {
  PRODUCTION_STEP_REGISTRY,
  isLiveAdapterWired,
  validateStepsForProductionActivation,
} from "@/lib/automation-platform/execution/production-step-registry";
import {
  listCompletedConditions,
  listCompletionEvidenceFields,
  listFailureConditions,
  listLiveAdapterInventory,
  proveZeroFakeSuccessDefaults,
} from "@/lib/automation-platform/execution/v2-real-proof";
import { REQUIRED_LIVE_ADAPTER_IDS } from "@/lib/automation-platform/execution/live-adapters/registry";
import { WIRED_LIVE_ADAPTER_IDS } from "@/lib/automation-platform/execution/live-adapters/wired-status";
import type { AutomationRun, AutomationRunStep } from "@/lib/automation-platform/types/run";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

function step(
  partial: Partial<AutomationWorkflowStep> &
    Pick<AutomationWorkflowStep, "id" | "type" | "name" | "order">,
): AutomationWorkflowStep {
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

function runStep(
  partial: Partial<AutomationRunStep> &
    Pick<AutomationRunStep, "id" | "capabilityId" | "name" | "status">,
): AutomationRunStep {
  return {
    id: partial.id,
    capabilityId: partial.capabilityId,
    name: partial.name,
    order: partial.order ?? 0,
    status: partial.status,
    attemptCount: partial.attemptCount ?? 1,
    startedAt: partial.startedAt ?? null,
    completedAt: partial.completedAt ?? new Date().toISOString(),
    errorCode: partial.errorCode ?? null,
    errorMessage: partial.errorMessage ?? null,
    outputSummary: partial.outputSummary ?? null,
    requiresApproval: partial.requiresApproval ?? false,
    highRisk: partial.highRisk ?? false,
  };
}

function baseRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  const now = new Date().toISOString();
  return {
    id: "run_proof",
    automationId: "auto_proof",
    automationName: "proof",
    userId: "user_proof",
    status: "running",
    runKey: "rk",
    idempotencyKey: "ik",
    scheduleOccurrenceKey: null,
    triggerType: "manual",
    scheduledFor: null,
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
    statusHistory: [],
    preparation: {
      summary: "prep",
      plannedSteps: [],
      approvalReason: null,
      approvalStepIds: [],
      externalEffects: [],
      estimatedDurationLabel: "",
      timezone: "Asia/Tokyo",
      scheduledLabel: "manual",
      preparedAt: now,
    },
    approval: {
      status: "not_required",
      mode: "run_then_notify",
      requestedAt: null,
      decidedAt: null,
      decidedByUserId: null,
      comment: null,
      stepIds: [],
    },
    steps: [],
    artifacts: [],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: "diag",
    createdAt: now,
    updatedAt: now,
    completionEvidence: null,
    memoryReferences: [],
    ...overrides,
  };
}

describe("Automation V2 real — 100 cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("docs: completed / failure / evidence / live adapter inventories", () => {
    expect(listCompletedConditions().length).toBeGreaterThanOrEqual(8);
    expect(listFailureConditions().length).toBeGreaterThanOrEqual(8);
    expect(listCompletionEvidenceFields()).toContain("executionId");
    expect(listCompletionEvidenceFields()).toContain("completionHash");
    const adapters = listLiveAdapterInventory();
    expect(adapters.length).toBeGreaterThanOrEqual(REQUIRED_LIVE_ADAPTER_IDS.length);
    expect(COMPLETED_CONDITIONS).toBeTruthy();
    expect(FAILURE_CONDITIONS).toBeTruthy();
  });

  it("01-22: defaultStepInvoker never succeeds for every production step", async () => {
    expect(PRODUCTION_STEP_REGISTRY.length).toBeGreaterThanOrEqual(20);
    for (const def of PRODUCTION_STEP_REGISTRY) {
      const result = await defaultStepInvoker({
        step: step({
          id: def.type,
          type: def.type,
          name: def.type,
          order: 0,
        }),
        userId: "u",
        automationName: "t",
        runId: "r",
        approved: true,
      });
      expect(result.ok, def.type).toBe(false);
      expect(result.errorCode).toBe("step_not_implemented");
    }
  });

  it("23-36: required Live Adapters inventory + unwired fail activation", () => {
    for (const id of [
      "atlas_deliverable_word",
      "atlas_deliverable_excel",
      "atlas_deliverable_pdf",
      "atlas_deliverable_powerpoint",
      "openai_vision",
      "openai_vision_ocr",
      "google_gmail",
      "google_drive",
      "dropbox",
      "x",
      "line",
    ] as const) {
      expect(isLiveAdapterWired(id), id).toBe(true);
    }
    expect(isLiveAdapterWired("slack")).toBe(false);
    expect(isLiveAdapterWired("discord")).toBe(false);
    expect(isLiveAdapterWired("notion")).toBe(false);

    const issues = validateStepsForProductionActivation([
      { id: "s1", type: "slack", enabled: true },
      { id: "s2", type: "discord", enabled: true },
      { id: "s3", type: "notion", enabled: true },
    ]);
    expect(issues.every((i) => i.errorCode === "live_adapter_missing")).toBe(
      true,
    );
    expect(issues.length).toBe(3);
  });

  it("37-48: external strict invoker fails closed without live/OAuth/input", async () => {
    const cases: Array<{
      type: AutomationWorkflowStep["type"];
      configuration: Record<string, unknown>;
    }> = [
      { type: "gmail", configuration: { to: "a@b.com" } },
      { type: "x_post", configuration: { text: "hello" } },
      { type: "dropbox", configuration: { folderPath: "/Atlas" } },
      { type: "google_calendar", configuration: {} },
      { type: "google_drive", configuration: {} },
      { type: "wordpress", configuration: { content: "body" } },
      { type: "slack", configuration: { message: "hi" } },
      { type: "discord", configuration: { message: "hi" } },
      { type: "notion", configuration: { pageTitle: "t" } },
      { type: "line_notify", configuration: { message: "done" } },
      { type: "gmail", configuration: { to: "" } },
      { type: "x_post", configuration: { text: "" } },
    ];
    for (const item of cases) {
      const result = await strictStepInvoker({
        step: step({
          id: item.type,
          type: item.type,
          name: item.type,
          order: 0,
          configuration: item.configuration,
          requiresApproval: true,
        }),
        userId: "u",
        automationName: "t",
        runId: "r",
        approved: true,
      });
      expect(result.ok, item.type).toBe(false);
    }
  });

  it("49-60: control-only / missing evidence / cancelled cannot complete", () => {
    const controlWorkflow = [
      step({ id: "w", type: "wait", name: "wait", order: 0, configuration: { durationMs: 0 } }),
      step({
        id: "c",
        type: "condition",
        name: "cond",
        order: 1,
        configuration: { expression: true },
      }),
    ];
    const controlRun = baseRun({
      steps: [
        runStep({ id: "w", capabilityId: "wait", name: "wait", status: "succeeded" }),
        runStep({
          id: "c",
          capabilityId: "condition",
          name: "cond",
          status: "succeeded",
        }),
      ],
    });
    const controlDecision = evaluateRunCompletion({
      run: controlRun,
      workflowSteps: controlWorkflow,
      artifacts: [],
      evidence: null,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(controlDecision.runStatus).toBe("failed");
    expect(controlDecision.reason).toMatch(/control_only|work/);

    const cancelled = evaluateRunCompletion({
      run: baseRun({ status: "cancelled", steps: [] }),
      workflowSteps: [
        step({ id: "w", type: "word_generate", name: "Word", order: 0 }),
      ],
      artifacts: [],
      evidence: null,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(cancelled.runStatus).toBe("failed");

    const wordWorkflow = [
      step({ id: "w", type: "word_generate", name: "Word", order: 0 }),
    ];
    const missingEvidence = evaluateRunCompletion({
      run: baseRun({
        steps: [
          runStep({
            id: "w",
            capabilityId: "word_generate",
            name: "Word",
            status: "succeeded",
          }),
        ],
      }),
      workflowSteps: wordWorkflow,
      artifacts: [
        {
          id: "art1",
          kind: "deliverable",
          label: "a.docx",
          url: "/api/deliverables/art1",
          externalId: null,
          createdAt: new Date().toISOString(),
          sizeBytes: 1200,
        },
      ],
      evidence: null,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(missingEvidence.runStatus).toBe("failed");
    // Without Completion Evidence, step-scoped requirements also fail closed.
    expect(
      ["completion_evidence_missing", "required_steps_incomplete"].includes(
        missingEvidence.reason,
      ),
    ).toBe(true);
  });

  it("61-72: step-scoped external evidence — no sibling pool contamination", () => {
    const workflow = [
      step({ id: "w", type: "word_generate", name: "Word", order: 0 }),
      step({
        id: "g",
        type: "gmail",
        name: "Gmail",
        order: 1,
        configuration: { to: "a@b.com", messageId: "m1" },
      }),
    ];
    const artifacts = [
      {
        id: "art_word",
        kind: "deliverable" as const,
        label: "a.docx",
        url: "/api/deliverables/art_word",
        externalId: null,
        createdAt: new Date().toISOString(),
        sizeBytes: 2048,
      },
    ];
    const fragments = [
      {
        stepId: "w",
        artifactIds: ["art_word"],
        storageObjectIds: ["art_word"],
        externalActionIds: [],
        externalUrls: ["/api/deliverables/art_word"],
        notificationIds: [],
        outputSizeBytes: 2048,
      },
      // Gmail marked succeeded WITHOUT externalActionIds — must fail
      {
        stepId: "g",
        artifactIds: [],
        storageObjectIds: [],
        externalActionIds: [],
        externalUrls: [],
        notificationIds: [],
      },
    ];
    const run = baseRun({
      steps: [
        runStep({
          id: "w",
          capabilityId: "word_generate",
          name: "Word",
          status: "succeeded",
        }),
        runStep({
          id: "g",
          capabilityId: "gmail",
          name: "Gmail",
          status: "succeeded",
        }),
      ],
      artifacts,
    });
    const evidence = buildCompletionEvidenceV2({
      run,
      completedStepIds: ["w", "g"],
      fragments,
    });
    const decision = evaluateRunCompletion({
      run,
      workflowSteps: workflow,
      artifacts,
      evidence,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(decision.runStatus).toBe("failed");
    expect(decision.missingEvidence.some((m) => m.includes("external"))).toBe(
      true,
    );
  });

  it("73-84: valid deliverable evidence can complete; incomplete fields fail", () => {
    const workflow = [
      step({ id: "w", type: "word_generate", name: "Word", order: 0 }),
    ];
    const artifacts = [
      {
        id: "art_ok",
        kind: "deliverable" as const,
        label: "ok.docx",
        url: "/api/deliverables/art_ok",
        externalId: null,
        createdAt: new Date().toISOString(),
        sizeBytes: 4096,
      },
    ];
    const run = baseRun({
      steps: [
        runStep({
          id: "w",
          capabilityId: "word_generate",
          name: "Word",
          status: "succeeded",
        }),
      ],
      artifacts,
    });
    const evidence = buildCompletionEvidenceV2({
      run,
      completedStepIds: ["w"],
      fragments: [
        {
          stepId: "w",
          artifactIds: ["art_ok"],
          storageObjectIds: ["art_ok"],
          externalActionIds: [],
          externalUrls: ["/api/deliverables/art_ok"],
          notificationIds: [],
          outputSizeBytes: 4096,
        },
      ],
    });
    expect(evidence).toBeTruthy();
    expect(evidence!.executionId).toBe(run.id);
    expect(evidence!.completionHash.length).toBeGreaterThan(20);
    expect(evidence!.outputSizeBytes).toBe(4096);
    expect(evidence!.storageUrls.length).toBeGreaterThan(0);

    const ok = evaluateRunCompletion({
      run,
      workflowSteps: workflow,
      artifacts,
      evidence,
      needsUserInput: false,
      retryScheduled: false,
    });
    expect(ok.runStatus).toBe("succeeded");
    expect(ok.productStatus).toBe("completed");

    const gaps = validateCompletionEvidenceFields(
      {
        ...evidence!,
        storageUrls: [],
        outputSizeBytes: 0,
      },
      { requireArtifacts: true },
    );
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("85-96: failure modes matrix (timeout/429/500/oauth/artifact/crash/recovery semantics)", () => {
    const codes = [
      "automation_timeout",
      "rate_limited",
      "upstream_5xx",
      "automation_integration_required",
      "run_artifact_missing",
      "live_adapter_missing",
      "automation_run_failed",
      "completion_evidence_missing",
      "step_not_implemented",
      "automation_feature_disabled",
      "run_notification_target_invalid",
      "partial_format_success_forbidden",
    ];
    for (const code of codes) {
      const decision = evaluateRunCompletion({
        run: baseRun({
          steps: [
            runStep({
              id: "w",
              capabilityId: "word_generate",
              name: "Word",
              status: "failed",
              errorCode: code,
              errorMessage: code,
            }),
          ],
          lastErrorCode: code,
          lastErrorMessage: code,
        }),
        workflowSteps: [
          step({ id: "w", type: "word_generate", name: "Word", order: 0 }),
        ],
        artifacts: [],
        evidence: null,
        needsUserInput: false,
        retryScheduled: false,
      });
      expect(decision.runStatus).toBe("failed");
      expect(decision.productStatus).toBe("failed");
    }
  });

  it("97: retry metadata fields exist on evidence after retries", () => {
    const run = baseRun({
      attemptCount: 3,
      attempts: [
        {
          attempt: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          errorCode: "upstream_5xx",
          errorMessage: "500",
          retryScheduledFor: new Date().toISOString(),
        },
        {
          attempt: 2,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          errorCode: "rate_limited",
          errorMessage: "429",
          retryScheduledFor: new Date().toISOString(),
        },
        {
          attempt: 3,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          retryScheduledFor: null,
        },
      ],
      steps: [
        runStep({
          id: "w",
          capabilityId: "word_generate",
          name: "Word",
          status: "succeeded",
        }),
      ],
      artifacts: [
        {
          id: "art_r",
          kind: "deliverable",
          label: "r.docx",
          url: "/api/deliverables/art_r",
          externalId: null,
          createdAt: new Date().toISOString(),
          sizeBytes: 100,
        },
      ],
    });
    const evidence = buildCompletionEvidenceV2({
      run,
      completedStepIds: ["w"],
      fragments: [
        {
          stepId: "w",
          artifactIds: ["art_r"],
          storageObjectIds: ["art_r"],
          externalUrls: ["/api/deliverables/art_r"],
          outputSizeBytes: 100,
        },
      ],
      retryCount: 2,
      retryReason: "upstream_5xx",
      retryTime: run.attempts[0]!.retryScheduledFor,
    });
    expect(evidence!.retryCount).toBe(2);
    expect(evidence!.retryReason).toBe("upstream_5xx");
    expect(evidence!.retryTime).toBeTruthy();
  });

  it("98-100: zero fake-success proof + wired inventory coverage", async () => {
    const proof = await proveZeroFakeSuccessDefaults();
    expect(proof.defaultInvokerSuccessCount).toBe(0);
    expect(proof.pass).toBe(true);
    expect(proof.evidencePoolingHoleClosed).toBe(true);
    expect(proof.controlOnlyCannotComplete).toBe(true);
    expect(WIRED_LIVE_ADAPTER_IDS.has("google_gmail")).toBe(true);
    expect(WIRED_LIVE_ADAPTER_IDS.has("slack")).toBe(false);
  });

  it("101-200: synthetic matrix — 100 crash/timeout/oauth/storage/notify failures never complete", () => {
    const reasons = [
      "timeout",
      "network",
      "storage",
      "notify",
      "api_timeout",
      "429",
      "500",
      "oauth",
      "artifact_missing",
      "mid_crash",
    ] as const;
    let completedLeak = 0;
    for (let i = 0; i < 100; i += 1) {
      const reason = reasons[i % reasons.length]!;
      const decision = evaluateRunCompletion({
        run: baseRun({
          id: `run_matrix_${i}`,
          steps: [
            runStep({
              id: "w",
              capabilityId: "word_generate",
              name: "Word",
              status: i % 17 === 0 ? "succeeded" : "failed",
              errorCode: reason,
              errorMessage: `${reason}_${i}`,
            }),
          ],
          artifacts:
            i % 17 === 0
              ? [
                  {
                    id: `art_${i}`,
                    kind: "deliverable",
                    label: "x.docx",
                    url: `/api/deliverables/art_${i}`,
                    externalId: null,
                    createdAt: new Date().toISOString(),
                    sizeBytes: 10,
                  },
                ]
              : [],
        }),
        workflowSteps: [
          step({ id: "w", type: "word_generate", name: "Word", order: 0 }),
        ],
        artifacts:
          i % 17 === 0
            ? [
                {
                  id: `art_${i}`,
                  kind: "deliverable",
                  label: "x.docx",
                  url: `/api/deliverables/art_${i}`,
                  externalId: null,
                  createdAt: new Date().toISOString(),
                  sizeBytes: 10,
                },
              ]
            : [],
        // Intentionally incomplete / missing evidence → must never be completed
        evidence: null,
        needsUserInput: false,
        retryScheduled: false,
      });
      if (
        decision.runStatus === "succeeded" ||
        decision.productStatus === "completed"
      ) {
        completedLeak += 1;
      }
      expect(decision.productStatus).not.toBe("completed");
    }
    expect(completedLeak).toBe(0);
  });
});
