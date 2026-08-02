import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

import {
  analyzeAutomationLearning,
  recordCorrection,
} from "@/lib/workflow-learning/analyze";
import {
  applyPatchToAutomation,
  isBlindRetryIncrease,
} from "@/lib/workflow-learning/apply-patch";
import { planLearningNotifications } from "@/lib/workflow-learning/notifications";
import {
  isBlockedExternalDocumentSource,
  touchesExternalSend,
} from "@/lib/workflow-learning/security";
import {
  applyCandidate,
  analyzeWorkflowLearningForAutomation,
  approveCandidate,
  compareAutomationLearning,
  completeTrialIfNeeded,
  listWorkflowCandidates,
  recordWorkflowCorrection,
  rejectCandidate,
  rollbackAutomationRevision,
} from "@/lib/workflow-learning/service";
import {
  listAuditForUser,
  listCandidates,
  listRevisions,
  listSignals,
  resetWorkflowLearningStoreForTests,
} from "@/lib/workflow-learning/store";
import { resetWorkflowLearningDurableForTests } from "@/lib/workflow-learning/durable";
import { DEFAULT_WORKFLOW_LEARNING_SETTINGS } from "@/lib/workflow-learning/types";
import {
  memoryInsertAutomation,
  memoryInsertRun,
  memoryListRunsForAutomation,
  resetAutomationPlatformStoreForTests,
} from "@/lib/automation-platform/repository/memory-store";
import type { AutomationRun, AutomationV2 } from "@/lib/automation-platform/types";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";

const USER = "user_wl_1";
const OTHER = "user_wl_other";
const EMAIL = "user@example.com";

function enableFlags(): void {
  setFeatureFlagState("workflow_learning_enabled", "on");
  setFeatureFlagState("automation_v2_enabled", "on");
}

function sampleAutomation(overrides: Partial<AutomationV2> = {}): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_wl_1",
    userId: USER,
    name: "営業資料",
    description: "",
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
    workflow: {
      version: 1,
      steps: [
        {
          id: "step_a",
          type: "orchestrate",
          name: "生成",
          order: 1,
          inputBindings: {},
          configuration: {},
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [] },
          timeoutMs: 60_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
        {
          id: "step_b",
          type: "dropbox",
          name: "保存",
          order: 2,
          inputBindings: {},
          configuration: {},
          requiresApproval: false,
          retryPolicy: { maxAttempts: 2, backoffMs: [1000] },
          timeoutMs: 30_000,
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
    instruction: { structuredOptions: {}, freeformNotes: "" },
    memoryPolicy: {
      enabled: true,
      allowedScopes: [],
      deniedScopes: [],
      lockedOverrides: {},
    },
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sampleRun(
  overrides: Partial<AutomationRun> & Pick<AutomationRun, "id" | "status">,
): AutomationRun {
  const now = new Date().toISOString();
  const automation = sampleAutomation();
  return {
    automationId: automation.id,
    automationName: automation.name,
    userId: USER,
    runKey: `rk_${overrides.id}`,
    idempotencyKey: `ik_${overrides.id}`,
    scheduleOccurrenceKey: null,
    triggerType: "schedule",
    scheduledFor: null,
    queuedAt: now,
    startedAt: now,
    completedAt: now,
    durationMs: 12_000,
    attemptCount: 1,
    maxAttempts: 3,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    failedStepId: null,
    retryable: false,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: {
      used: [],
      updated: [],
      unusedScopes: [],
      tokenEstimate: 800,
    },
    statusHistory: [],
    preparation: null,
    approval: null,
    steps: automation.workflow.steps.map((s) => ({
      id: s.id,
      capabilityId: s.type,
      name: s.name,
      order: s.order,
      status: overrides.status === "failed" ? "failed" : "succeeded",
      requiresApproval: false,
      highRisk: false,
      startedAt: now,
      completedAt: now,
      errorCode: null,
      errorMessage: null,
      attemptCount: 1,
      outputSummary: null,
    })),
    artifacts: [],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: `d_${overrides.id}`,
    createdAt: now,
    updatedAt: now,
    memoryReferences: [],
    ...overrides,
  };
}

beforeEach(() => {
  resetWorkflowLearningStoreForTests();
  resetWorkflowLearningDurableForTests();
  resetAutomationPlatformStoreForTests();
  resetFeatureFlagStore();
  enableFlags();
  memoryInsertAutomation(sampleAutomation());
});

describe("Workflow Learning corrections", () => {
  it("1-2. creates candidate after 3 shorten corrections, not after 1", () => {
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "もっと短くしてください",
    });
    let list = analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    expect(list.filter((c) => c.status === "candidate")).toHaveLength(0);

    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "もっと短くしてください",
    });
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "もっと短くしてください",
    });
    list = analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    const candidates = list.filter((c) => c.status === "candidate");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.summary).toContain("短く");
    expect(candidates[0]?.deferToMemory).toBe(true);
  });

  it("3. save destination candidate at threshold 2", () => {
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "保存先をDriveの営業フォルダに変更",
    });
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "保存先をDriveの営業フォルダに変更",
    });
    const list = analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    expect(list.some((c) => c.type === "save_destination")).toBe(true);
  });

  it("4-5. step order and disable candidates", () => {
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "ステップの順番を変えて",
    });
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "ステップの順番を変えて",
    });
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "このステップ不要",
    });
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "このステップ不要",
    });
    const list = analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    expect(list.some((c) => c.type === "step_order")).toBe(true);
    expect(list.some((c) => c.type === "step_disable")).toBe(true);
  });
});

describe("Workflow Learning failures and cost", () => {
  it("6-8. retry/timeout/failure patterns without step delete", () => {
    const runs = [1, 2, 3].map((i) =>
      sampleRun({
        id: `fail_${i}`,
        status: "failed",
        failedStepId: "step_b",
        lastErrorCode: "storage_not_found",
        lastErrorMessage: "folder missing",
      }),
    );
    for (const run of runs) memoryInsertRun(run);
    const list = analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: memoryListRunsForAutomation({
        userId: USER,
        automationId: "auto_wl_1",
      }),
    });
    expect(list.some((c) => c.summary.includes("保存先"))).toBe(true);
    expect(list.every((c) => c.type !== "step_remove")).toBe(true);
  });

  it("9. cost candidate for high tokens", () => {
    const runs = [1, 2, 3].map((i) =>
      sampleRun({
        id: `cost_${i}`,
        status: "succeeded",
        memoryUsage: {
          used: [],
          updated: [],
          unusedScopes: [],
          tokenEstimate: 9000,
        },
      }),
    );
    const list = analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs,
    });
    expect(list.some((c) => c.type === "cost_reduction")).toBe(true);
  });

  it("32. does not propose blind retry increase", () => {
    const patch = {
      kind: "retry_policy" as const,
      stepId: "step_a",
      retryPolicy: { maxAttempts: 5 },
      rationale: "just_more",
    };
    expect(isBlindRetryIncrease(1, patch)).toBe(true);
  });
});

describe("approve apply revision trial rollback", () => {
  async function seedShortenCandidate() {
    for (let i = 0; i < 3; i += 1) {
      await recordWorkflowCorrection({
        userId: USER,
        email: EMAIL,
        automationId: "auto_wl_1",
        text: "もっと短くしてください",
      });
    }
    await analyzeWorkflowLearningForAutomation({
      userId: USER,
      email: EMAIL,
      automationId: "auto_wl_1",
    });
    return (await listWorkflowCandidates({ userId: USER, email: EMAIL })).find(
      (c) => c.status === "candidate",
    )!;
  }

  it("10. Memory defer flag separates preference from structure", async () => {
    const candidate = await seedShortenCandidate();
    expect(candidate.deferToMemory).toBe(true);
  });

  it("11-16. approve apply creates new revision and keeps old", async () => {
    const candidate = await seedShortenCandidate();
    await approveCandidate({
      userId: USER,
      email: EMAIL,
      candidateId: candidate.id,
    });
    const applied = await applyCandidate({
      userId: USER,
      email: EMAIL,
      candidateId: candidate.id,
    });
    const revs = listRevisions("auto_wl_1");
    expect(revs.length).toBeGreaterThanOrEqual(2);
    expect(applied.candidate.status).toBe("applied");
    expect(revs.some((r) => r.changeSource === "baseline")).toBe(true);
    expect(revs.some((r) => r.id === applied.revisionId)).toBe(true);
  });

  it("12-13. reject and suppress prevent re-proposal", async () => {
    const candidate = await seedShortenCandidate();
    await rejectCandidate({
      userId: USER,
      email: EMAIL,
      candidateId: candidate.id,
      suppressFuture: true,
    });
    for (let i = 0; i < 3; i += 1) {
      recordCorrection({
        userId: USER,
        automationId: "auto_wl_1",
        text: "もっと短くしてください",
      });
    }
    const list = analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    expect(
      list.filter(
        (c) => c.fingerprint === candidate.fingerprint && c.status === "candidate",
      ),
    ).toHaveLength(0);
  });

  it("14. edited patch on apply", async () => {
    const candidate = await seedShortenCandidate();
    const result = await applyCandidate({
      userId: USER,
      email: EMAIL,
      candidateId: candidate.id,
      editedPatch: {
        kind: "timeout",
        stepId: "step_a",
        timeoutMs: 120_000,
      },
    });
    expect(result.candidate.proposedPatch.kind).toBe("timeout");
  });

  it("17-20. trial failure auto rollback", async () => {
    // Use a structural candidate via save destination
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "保存先をDriveへ",
    });
    recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "保存先をDriveへ",
    });
    await analyzeWorkflowLearningForAutomation({
      userId: USER,
      email: EMAIL,
      automationId: "auto_wl_1",
    });
    const candidate = (await listWorkflowCandidates({ userId: USER, email: EMAIL })).find(
      (c) => c.type === "save_destination",
    )!;
    const trial = await applyCandidate({
      userId: USER,
      email: EMAIL,
      candidateId: candidate.id,
      trial: true,
    });
    expect(trial.trialId).toBeTruthy();
    // Insert a worse run after trial
    memoryInsertRun(
      sampleRun({
        id: "trial_bad",
        status: "failed",
        failedStepId: "step_b",
        lastErrorCode: "timeout",
        durationMs: 90_000,
        completedAt: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    const completion = await completeTrialIfNeeded({
      userId: USER,
      email: EMAIL,
      automationId: "auto_wl_1",
    });
    expect(completion).not.toBeNull();
    expect(completion?.comparison).toBeTruthy();
  });

  it("21. manual rollback", async () => {
    const candidate = await seedShortenCandidate();
    const applied = await applyCandidate({
      userId: USER,
      email: EMAIL,
      candidateId: candidate.id,
    });
    const revs = listRevisions("auto_wl_1").sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    );
    const baseline = revs[0]!;
    const result = await rollbackAutomationRevision({
      userId: USER,
      email: EMAIL,
      automationId: "auto_wl_1",
      targetRevisionId: baseline.id,
    });
    expect(result.revisionId).toBeTruthy();
    expect(result.revisionId).not.toBe(applied.revisionId);
    expect(listRevisions("auto_wl_1").length).toBeGreaterThanOrEqual(3);
  });

  it("22. compare metrics returns summary", async () => {
    const candidate = await seedShortenCandidate();
    const applied = await applyCandidate({
      userId: USER,
      email: EMAIL,
      candidateId: candidate.id,
    });
    const revs = listRevisions("auto_wl_1").sort(
      (a, b) => a.revisionNumber - b.revisionNumber,
    );
    const comparison = await compareAutomationLearning({
      userId: USER,
      email: EMAIL,
      automationId: "auto_wl_1",
      beforeRevisionId: revs[0]!.id,
      afterRevisionId: applied.revisionId,
    });
    expect(comparison.summary.length).toBeGreaterThan(0);
  });

  it("23-24. high risk external send blocked without confirm", async () => {
    expect(
      touchesExternalSend({
        kind: "execution_policy",
        executionPolicy: { mode: "run_then_notify" },
      }),
    ).toBe(true);
    const { next } = applyPatchToAutomation(
      sampleAutomation(),
      {
        kind: "execution_policy",
        executionPolicy: { mode: "run_then_notify" },
      },
      { allowHighRiskExternal: true },
    );
    expect(next.executionPolicy.mode).toBe("run_then_notify");
    expect(() =>
      applyPatchToAutomation(sampleAutomation(), {
        kind: "execution_policy",
        executionPolicy: { mode: "run_then_notify" },
      }),
    ).toThrow();
  });
});

describe("security and isolation", () => {
  it("25-26. other user cannot list or apply", async () => {
    for (let i = 0; i < 3; i += 1) {
      recordCorrection({
        userId: USER,
        automationId: "auto_wl_1",
        text: "もっと短くしてください",
      });
    }
    analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    const mine = await listWorkflowCandidates({ userId: USER, email: EMAIL });
    expect(mine.length).toBeGreaterThan(0);
    const other = await listWorkflowCandidates({ userId: OTHER, email: EMAIL });
    expect(other).toHaveLength(0);
    await expect(
      applyCandidate({
        userId: OTHER,
        email: EMAIL,
        candidateId: mine[0]!.id,
      }),
    ).rejects.toThrow();
  });

  it("27. external document source does not create signal", () => {
    expect(isBlockedExternalDocumentSource("uploaded_document")).toBe(true);
    const signal = recordCorrection({
      userId: USER,
      automationId: "auto_wl_1",
      text: "もっと短く",
      source: "uploaded_document",
    });
    expect(signal).toBeNull();
    expect(listSignals(USER)).toHaveLength(0);
  });

  it("28-29. duplicate and rejected fingerprints", async () => {
    for (let i = 0; i < 3; i += 1) {
      recordCorrection({
        userId: USER,
        automationId: "auto_wl_1",
        text: "もっと短くしてください",
      });
    }
    analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation(),
      runs: [],
    });
    const open = listCandidates(USER).filter((c) => c.status === "candidate");
    expect(open.length).toBe(1);
  });

  it("30. notification digest plans without spam", () => {
    const items = planLearningNotifications({
      settings: {
        ...DEFAULT_WORKFLOW_LEARNING_SETTINGS,
        notifyDigest: "weekly",
      },
      candidates: [
        {
          id: "c1",
          userId: USER,
          automationId: "auto_wl_1",
          sourceRunIds: [],
          type: "cost_reduction",
          summary: "低効果",
          reason: "r",
          evidence: [],
          proposedPatch: {
            kind: "instruction_preference_hint",
            note: "x",
          },
          expectedBenefit: {
            timeReduction: 0.01,
            costReduction: 0.01,
            failureReduction: 0,
            manualStepReduction: 0,
          },
          riskLevel: "low",
          confidence: 0.6,
          status: "candidate",
          fingerprint: "fp1",
          deferToMemory: false,
          trialOnly: false,
          expiresAt: null,
          appliedRevisionId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    expect(items.every((i) => i.priority === "digest" || i.priority === "immediate")).toBe(
      true,
    );
  });

  it("33. audit log recorded", async () => {
    for (let i = 0; i < 3; i += 1) {
      await recordWorkflowCorrection({
        userId: USER,
        email: EMAIL,
        automationId: "auto_wl_1",
        text: "もっと短くしてください",
      });
    }
    await analyzeWorkflowLearningForAutomation({
      userId: USER,
      email: EMAIL,
      automationId: "auto_wl_1",
    });
    expect(listAuditForUser(USER).some((a) => a.action === "analyze")).toBe(true);
  });

  it("34. feature flag off blocks service", async () => {
    setFeatureFlagState("workflow_learning_enabled", "off");
    await expect(
      listWorkflowCandidates({ userId: USER, email: EMAIL }),
    ).rejects.toThrow(/ご利用いただけません/);
  });

  it("35-36. paused/archived still analyzable; archived apply blocked", async () => {
    memoryInsertAutomation(sampleAutomation({ status: "paused" }));
    await analyzeWorkflowLearningForAutomation({
      userId: USER,
      email: EMAIL,
      automationId: "auto_wl_1",
    });
    memoryInsertAutomation(sampleAutomation({ status: "archived" }));
    for (let i = 0; i < 3; i += 1) {
      recordCorrection({
        userId: USER,
        automationId: "auto_wl_1",
        text: "もっと短くしてください",
      });
    }
    analyzeAutomationLearning({
      userId: USER,
      automation: sampleAutomation({ status: "archived" }),
      runs: [],
    });
    const candidate = listCandidates(USER).find((c) => c.status === "candidate");
    expect(candidate).toBeTruthy();
    await expect(
      applyCandidate({
        userId: USER,
        email: EMAIL,
        candidateId: candidate!.id,
      }),
    ).rejects.toThrow(/アーカイブ/);
  });
});
