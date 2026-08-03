import { describe, expect, it } from "vitest";

import { evaluateExternalCompletionGate } from "@/lib/automation-platform/execution/external-completion-gate";
import type { AutomationRun } from "@/lib/automation-platform/types/run";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

function baseRun(
  overrides: Partial<AutomationRun> = {},
): AutomationRun {
  return {
    id: "run_1",
    automationId: "auto_1",
    userId: "user_1",
    automationName: "test",
    status: "running",
    triggerType: "manual",
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    attemptCount: 0,
    maxAttempts: 3,
    retryable: false,
    nextRetryAt: null,
    runKey: "rk",
    idempotencyKey: "ik",
    scheduleOccurrenceKey: null,
    diagnosticId: "diag",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    artifacts: [],
    steps: [],
    statusHistory: [],
    attempts: [],
    resultSummary: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    approval: null,
    preparation: null,
    resolvedInstruction: null,
    memoryUsage: null,
    memoryReferences: [],
    durationMs: null,
    ...overrides,
  } as AutomationRun;
}

describe("External Completion Gate", () => {
  it("passes for non-external workflows", () => {
    const workflowSteps = [
      {
        id: "s1",
        type: "wait",
        name: "wait",
        enabled: true,
        configuration: {},
        inputBindings: {},
      },
    ] as unknown as AutomationWorkflowStep[];
    const result = evaluateExternalCompletionGate({
      run: baseRun(),
      workflowSteps,
      evidence: null,
    });
    expect(result.ok).toBe(true);
  });

  it("fails when external evidence is missing", () => {
    const workflowSteps = [
      {
        id: "s1",
        type: "dropbox",
        name: "Dropbox",
        enabled: true,
        configuration: {},
        inputBindings: {},
      },
    ] as unknown as AutomationWorkflowStep[];
    const result = evaluateExternalCompletionGate({
      run: baseRun({
        steps: [
          {
            id: "s1",
            capabilityId: "dropbox",
            name: "Dropbox",
            order: 0,
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
        ],
      }),
      workflowSteps,
      evidence: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("completion_evidence_missing");
  });

  it("fails when waiting_approval remains", () => {
    const workflowSteps = [
      {
        id: "s1",
        type: "wordpress",
        name: "WordPress",
        enabled: true,
        configuration: { publishMode: "publish" },
        inputBindings: {},
      },
    ] as unknown as AutomationWorkflowStep[];
    const result = evaluateExternalCompletionGate({
      run: baseRun({
        steps: [
          {
            id: "s1",
            capabilityId: "wordpress",
            name: "WordPress",
            order: 0,
            status: "waiting_approval",
            requiresApproval: true,
            highRisk: true,
            startedAt: null,
            completedAt: null,
            errorCode: null,
            errorMessage: null,
            attemptCount: 1,
            outputSummary: null,
          },
        ],
      }),
      workflowSteps,
      evidence: {
        runId: "run_1",
        jobId: "run_1",
        automationId: "auto_1",
        ownerId: "user_1",
        completedStepIds: [],
        artifactIds: [],
        storageObjectIds: [],
        externalActionIds: ["wp_1"],
        externalUrls: ["https://example.com"],
        notificationIds: [],
        incompleteOptionalStepIds: [],
        completionHash: "abc",
        completedAt: new Date().toISOString(),
        evidenceVersion: 1,
        adapterMode: "production",
        environment: "test",
        driveResults: [],
        gmailResults: [],
        calendarResults: [],
        dropboxResults: [],
        wordpressResults: [],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("waiting_approval_present");
  });
});
