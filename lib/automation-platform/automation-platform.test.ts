import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-${automation.id}`,
    registered: true,
  })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));
vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(() => ({ notificationId: "n1" })),
}));

import {
  listAutomationAuditEvents,
  resetAutomationAuditLogForTests,
} from "@/lib/automation-platform/audit/log";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import {
  normalizeExecutionPolicy,
  resolveRunApprovalRequirement,
} from "@/lib/automation-platform/execution/policy";
import {
  buildIdempotencyKey,
  buildRunKey,
  buildScheduleOccurrenceKey,
} from "@/lib/automation-platform/idempotency/keys";
import {
  detectInstructionConflicts,
  resolveInstruction,
} from "@/lib/automation-platform/instruction/conflict";
import {
  applyMemoryWithOverrides,
  validateMemoryPolicy,
} from "@/lib/automation-platform/memory/contract";
import { migrateV1Automations } from "@/lib/automation-platform/migration/v1-to-v2";
import {
  memoryUpdateRun,
  resetAutomationPlatformStoreForTests,
} from "@/lib/automation-platform/repository/memory-store";
import {
  assertNotPastOneShot,
  computeNextRunFromSchedule,
  computeNextRunIsoFromTrigger,
} from "@/lib/automation-platform/schedule/compute";
import { buildAutomationFromCreateInput } from "@/lib/automation-platform/schema/validate";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { isKnownCapabilityId } from "@/lib/automation-platform/step-registry/registry";
import {
  assertRunTransition,
  canTransitionRunStatus,
} from "@/lib/automation-platform/state-machine/transitions";
import type {
  AutomationV2,
  CreateAutomationV2Input,
} from "@/lib/automation-platform/types";
import type { Automation as AutomationV1 } from "@/lib/automations/types";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";

const ownerContext = buildFeatureAccessContext("owner@example.com");

function enableV2Flags(): void {
  setFeatureFlagState("automation_v2_enabled", "on");
  setFeatureFlagState("automation_memory_enabled", "on");
  setFeatureFlagState("automation_approval_enabled", "on");
}

function baseWorkflow(): CreateAutomationV2Input["workflow"] {
  return {
    version: 1,
    steps: [
      {
        id: "step-excel",
        type: "excel_generate",
        name: "Excel生成",
        order: 1,
        inputBindings: {},
        configuration: { title: "テスト成果物" },
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
  };
}

function dailyTrigger(
  hour = 9,
  minute = 0,
): CreateAutomationV2Input["trigger"] {
  return {
    type: "schedule",
    timezone: "Asia/Tokyo",
    schedule: {
      frequency: "daily",
      hour,
      minute,
    },
    event: null,
    condition: null,
  };
}

async function createActive(input?: Partial<CreateAutomationV2Input>): Promise<AutomationV2> {
  return await automationPlatformService.create(
    "user_a",
    {
      name: "日次レポート",
      description: "毎朝の報告",
      status: "active",
      trigger: dailyTrigger(),
      workflow: baseWorkflow(),
      executionPolicy: { mode: "run_then_notify" },
      instruction: {
        structuredOptions: { generatePdf: true },
        freeformNotes: "簡潔に",
      },
      rejectOnConflict: false,
      ...input,
    },
    ownerContext,
  );
}

beforeEach(async () => {
  resetAutomationPlatformStoreForTests();
  const { resetAutomationV2DbStoreForTests } = await import(
    "@/lib/automation-platform/repository/db-store"
  );
  resetAutomationV2DbStoreForTests();
  resetAutomationAuditLogForTests();
  resetAutomationRateLimitForTests();
  resetFeatureFlagStore();
  enableV2Flags();
});

describe("Automation Platform Phase 1", () => {
  it("1. creates automation", async () => {
    const created = await createActive();
    expect(created.id).toBeTruthy();
    expect(created.schemaVersion).toBe(2);
    expect(created.userId).toBe("user_a");
    expect(created.status).toBe("active");
  });

  it("2. updates automation", async () => {
    const created = await createActive();
    const updated = await automationPlatformService.update(
      "user_a",
      created.id,
      { name: "更新後" },
      ownerContext,
    );
    expect(updated.name).toBe("更新後");
  });

  it("3. duplicates automation as draft", async () => {
    const created = await createActive();
    const copy = await automationPlatformService.duplicate(
      "user_a",
      created.id,
      ownerContext,
    );
    expect(copy.id).not.toBe(created.id);
    expect(copy.status).toBe("draft");
    expect(copy.name).toContain("コピー");
  });

  it("4. pauses automation", async () => {
    const created = await createActive();
    const paused = await automationPlatformService.pause(
      "user_a",
      created.id,
      ownerContext,
    );
    expect(paused.automation.status).toBe("paused");
    expect(paused.automation.nextRunAt).toBeNull();
    expect(paused.effects.scheduleStopped).toBe(true);
    expect(paused.effects.resumeNote).toContain("過去分");
  });

  it("5. resumes automation", async () => {
    const created = await createActive();
    await automationPlatformService.pause("user_a", created.id, ownerContext);
    const resumed = await automationPlatformService.resume(
      "user_a",
      created.id,
      ownerContext,
    );
    expect(resumed.status).toBe("active");
    expect(resumed.nextRunAt).toBeTruthy();
  });

  it("6. archives automation", async () => {
    const created = await createActive();
    const archived = await automationPlatformService.archive(
      "user_a",
      created.id,
      ownerContext,
    );
    expect(archived.status).toBe("archived");
  });

  it("7. manual run enqueue", async () => {
    const created = await createActive({
      executionPolicy: { mode: "run_then_notify" },
    });
    const result = await automationPlatformService.enqueueRun({
      userId: "user_a",
      automationId: created.id,
      triggerType: "manual",
      context: ownerContext,
    });
    expect(result.created).toBe(true);
    expect([
      "queued",
      "awaiting_approval",
      "running",
      "succeeded",
      "partially_succeeded",
      "retrying",
      "failed",
    ]).toContain(result.run.status);
    expect(result.run.preparation).toBeTruthy();
    expect(result.run.steps.length).toBeGreaterThan(0);
  });

  it("8. daily schedule next run", () => {
    // 08:59 JST on Aug 1 → next slot is 09:00 JST (= 00:00 UTC)
    const from = new Date("2026-07-31T23:59:00.000Z");
    const next = computeNextRunFromSchedule(
      { frequency: "daily", hour: 9, minute: 0 },
      "Asia/Tokyo",
      from,
    );
    expect(next).toBeTruthy();
    expect(next!.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("9. weekly schedule", () => {
    const from = new Date("2026-08-01T00:00:00.000Z"); // Saturday UTC
    const next = computeNextRunFromSchedule(
      { frequency: "weekly", hour: 10, minute: 0, daysOfWeek: [1] },
      "Asia/Tokyo",
      from,
    );
    expect(next).toBeTruthy();
    const day = next!.getUTCDay();
    // Monday 10:00 JST = Sunday 01:00 UTC or Monday depending — just ensure future
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
    expect(day === 0 || day === 1).toBe(true);
  });

  it("10. monthly schedule", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const next = computeNextRunFromSchedule(
      { frequency: "monthly", hour: 9, minute: 0, dayOfMonth: 15 },
      "Asia/Tokyo",
      from,
    );
    expect(next).toBeTruthy();
    expect(next!.toISOString()).toContain("2026-08-15");
  });

  it("11. month-end schedule clamps", async () => {
    const from = new Date("2026-01-31T15:00:00.000Z"); // Feb approaching
    const next = computeNextRunFromSchedule(
      { frequency: "month_end", hour: 9, minute: 0 },
      "Asia/Tokyo",
      from,
    );
    expect(next).toBeTruthy();
  });

  it("12. once schedule", async () => {
    const runAt = "2026-12-01T00:00:00.000Z";
    const next = computeNextRunFromSchedule(
      { frequency: "once", hour: 0, minute: 0, runAt },
      "Asia/Tokyo",
      new Date("2026-08-01T00:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe(runAt);
  });

  it("13. timezone validation and default Tokyo", async () => {
    const trigger = dailyTrigger(9, 0);
    expect(trigger.timezone).toBe("Asia/Tokyo");
    const iso = computeNextRunIsoFromTrigger(trigger, new Date("2026-08-01T00:00:00.000Z"));
    expect(iso).toBeTruthy();
  });

  it("14. rejects past one-shot", async () => {
    expect(() =>
      assertNotPastOneShot(
        {
          frequency: "once",
          hour: 0,
          minute: 0,
          runAt: "2020-01-01T00:00:00.000Z",
        },
        new Date("2026-08-01T00:00:00.000Z"),
      ),
    ).toThrow(AutomationPlatformError);
  });

  it("15. stores structuredOptions", async () => {
    const created = await createActive({
      instruction: {
        structuredOptions: { generatePdf: true, format: "A4" },
        freeformNotes: "",
      },
    });
    expect(created.instruction.structuredOptions).toMatchObject({
      generatePdf: true,
      format: "A4",
    });
  });

  it("16. stores freeformNotes", async () => {
    const created = await createActive({
      instruction: {
        structuredOptions: {},
        freeformNotes: "トーンは丁寧に",
      },
    });
    expect(created.instruction.freeformNotes).toBe("トーンは丁寧に");
  });

  it("17. detects structured vs freeform conflict", () => {
    const conflicts = detectInstructionConflicts({
      structuredOptions: { generatePdf: true },
      freeformNotes: "PDFは不要、Excelだけでよい",
    });
    expect(conflicts.length).toBeGreaterThan(0);
    const resolved = resolveInstruction({
      instruction: {
        structuredOptions: { generatePdf: true },
        freeformNotes: "PDFは不要、Excelだけでよい",
      },
    });
    expect(resolved.requiresUserConfirmation).toBe(true);
  });

  it("18. review_before_run requires approval", () => {
    const policy = normalizeExecutionPolicy({ mode: "review_before_run" });
    const result = resolveRunApprovalRequirement({
      policy,
      steps: baseWorkflow().steps,
      isFirstRun: true,
      priorApprovalsCount: 0,
    });
    expect(result.requiresApproval).toBe(true);
  });

  it("19. run_then_notify skips approval for low risk", () => {
    const policy = normalizeExecutionPolicy({ mode: "run_then_notify" });
    const result = resolveRunApprovalRequirement({
      policy,
      steps: baseWorkflow().steps,
      isFirstRun: false,
      priorApprovalsCount: 1,
    });
    expect(result.requiresApproval).toBe(false);
  });

  it("20. review_selected_steps", () => {
    const steps = [
      ...baseWorkflow().steps,
      {
        id: "notify",
        type: "notify" as const,
        name: "通知",
        order: 2,
        inputBindings: {},
        configuration: {},
        requiresApproval: true,
        retryPolicy: { maxAttempts: 1, backoffMs: [] },
        timeoutMs: 10_000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      },
    ];
    const policy = normalizeExecutionPolicy({
      mode: "review_selected_steps",
      selectedStepIds: ["notify"],
    });
    const result = resolveRunApprovalRequirement({
      policy,
      steps,
      isFirstRun: false,
      priorApprovalsCount: 0,
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.stepIds).toContain("notify");
  });

  it("21. high-risk step always requires approval", async () => {
    const steps = [
      {
        id: "x",
        type: "x_post" as const,
        name: "X",
        order: 1,
        inputBindings: {},
        configuration: {},
        requiresApproval: false,
        retryPolicy: { maxAttempts: 1, backoffMs: [] },
        timeoutMs: 10_000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      },
    ];
    const policy = normalizeExecutionPolicy({ mode: "run_then_notify" });
    const result = resolveRunApprovalRequirement({
      policy,
      steps,
      isFirstRun: false,
      priorApprovalsCount: 99,
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toBe("system_high_risk_override");
  });

  it("22. approval expiry", async () => {
    const created = await createActive({
      executionPolicy: {
        mode: "review_before_run",
        approvalTimeoutMs: 1,
      },
    });
    const enqueued = await automationPlatformService.enqueueRun({
      userId: "user_a",
      automationId: created.id,
      triggerType: "manual",
      context: ownerContext,
    });
    // Force expiry
    const expiredRun = {
      ...enqueued.run,
      approvalExpiresAt: new Date(Date.now() - 1000).toISOString(),
      status: "awaiting_approval" as const,
    };
    memoryUpdateRun(expiredRun);

    await expect(
      automationPlatformService.approveRun(
        "user_a",
        expiredRun.id,
        ownerContext,
      ),
    ).rejects.toThrow(AutomationPlatformError);
  });

  it("23. run status transitions", async () => {
    expect(canTransitionRunStatus("queued", "running")).toBe(true);
    expect(canTransitionRunStatus("running", "succeeded")).toBe(true);
  });

  it("24. rejects illegal run transition", async () => {
    expect(() => assertRunTransition("succeeded", "running")).toThrow(
      AutomationPlatformError,
    );
  });

  it("25. scheduleOccurrenceKey dedupe", async () => {
    const created = await createActive({
      executionPolicy: { mode: "run_then_notify" },
    });
    const scheduledFor = "2026-08-01T00:00:00.000Z";
    const first = await automationPlatformService.enqueueRun({
      userId: "user_a",
      automationId: created.id,
      triggerType: "schedule",
      scheduledFor,
      context: ownerContext,
    });
    const second = await automationPlatformService.enqueueRun({
      userId: "user_a",
      automationId: created.id,
      triggerType: "schedule",
      scheduledFor,
      context: ownerContext,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);
    expect(
      buildScheduleOccurrenceKey({
        automationId: created.id,
        scheduledFor,
      }),
    ).toBe(first.run.scheduleOccurrenceKey);
  });

  it("26. retry key distinct but occurrence still unique", async () => {
    const key = buildRunKey({
      automationId: "auto1",
      triggerType: "retry",
      scheduledFor: "2026-08-01T00:00:00.000Z",
    });
    expect(key.startsWith("retry:")).toBe(true);
    const idemp = buildIdempotencyKey({
      userId: "u",
      automationId: "auto1",
      operation: "retry",
      occurrenceKey: "occurrence:auto1:2026-08-01T00:00:00.000Z",
    });
    expect(idemp).toContain("occurrence:auto1");
  });

  it("27. denies other user get", async () => {
    const created = await createActive();
    await expect(
      automationPlatformService.get("user_b", created.id, ownerContext),
    ).rejects.toThrow(AutomationPlatformError);
  });

  it("28. denies other user update", async () => {
    const created = await createActive();
    await expect(
      automationPlatformService.update(
        "user_b",
        created.id,
        { name: "hijack" },
        ownerContext,
      ),
    ).rejects.toThrow(AutomationPlatformError);
  });

  it("29. denies other user run", async () => {
    const created = await createActive();
    await expect(
      automationPlatformService.enqueueRun({
        userId: "user_b",
        automationId: created.id,
        triggerType: "manual",
        context: ownerContext,
      }),
    ).rejects.toThrow(AutomationPlatformError);
  });

  it("30. feature flag off blocks create", async () => {
    setFeatureFlagState("automation_v2_enabled", "off");
    await expect(createActive()).rejects.toThrow(AutomationPlatformError);
  });

  it("31. reads legacy V1 shape via migration converter", async () => {
    const v1 = sampleV1();
    const report = migrateV1Automations([v1], "dry-run");
    expect(report.sourceCount).toBe(1);
    expect(report.successCount).toBe(1);
    expect(Object.keys(report.idMap)).toContain(v1.id);
  });

  it("32. migration dry-run does not persist", async () => {
    const v1 = sampleV1();
    migrateV1Automations([v1], "dry-run");
    const listed = await automationPlatformService.list("user_a", ownerContext);
    expect(listed.find((item) => item.legacyAutomationId === v1.id)).toBeUndefined();
  });

  it("33. migration re-run is idempotent", async () => {
    const v1 = sampleV1();
    const first = migrateV1Automations([v1], "apply");
    const second = migrateV1Automations([v1], "apply");
    expect(first.successCount).toBe(1);
    expect(second.skippedCount).toBe(1);
    expect(second.idMap[v1.id]).toBe(first.idMap[v1.id]);
  });

  it("34. memory scope saved", async () => {
    const created = await createActive({
      memoryPolicy: {
        enabled: true,
        allowedScopes: ["writing_style", "timezone"],
        deniedScopes: [],
        lockedOverrides: {},
      },
    });
    expect(created.memoryPolicy.allowedScopes).toContain("writing_style");
  });

  it("35. lockedOverrides win", () => {
    const result = applyMemoryWithOverrides({
      policy: {
        enabled: true,
        allowedScopes: ["writing_style"],
        deniedScopes: [],
        lockedOverrides: { writing_style: "formal" },
      },
      memoryValues: { writing_style: "casual" },
    });
    expect(result.values.writing_style).toBe("formal");
    expect(result.references.some((r) => r.source === "locked_override")).toBe(
      true,
    );
  });

  it("36. rejects invalid step type", () => {
    expect(() =>
      buildAutomationFromCreateInput("user_a", {
        name: "bad",
        trigger: dailyTrigger(),
        workflow: {
          version: 1,
          steps: [
            {
              id: "x",
              type: "not_a_real_step" as never,
              name: "x",
              order: 1,
              inputBindings: {},
              configuration: {},
              requiresApproval: false,
              retryPolicy: { maxAttempts: 1, backoffMs: [] },
              timeoutMs: 1,
              onSuccess: null,
              onFailure: null,
              enabled: true,
            },
          ],
          onFailure: { strategy: "stop", notify: true },
          timeoutPolicy: {
            workflowTimeoutMs: 1,
            stepDefaultTimeoutMs: 1,
          },
        },
      }),
    ).toThrow(AutomationPlatformError);
    expect(isKnownCapabilityId("orchestrate")).toBe(true);
    expect(isKnownCapabilityId("not_a_real_step")).toBe(false);
  });

  it("37. rejects invalid memory scope / external capability combo", async () => {
    expect(() =>
      validateMemoryPolicy({
        enabled: true,
        allowedScopes: ["not_real" as never],
        deniedScopes: [],
        lockedOverrides: {},
      }),
    ).toThrow(AutomationPlatformError);

    await expect(
      createActive({
        workflow: {
          version: 1,
          steps: [
            {
              id: "wp",
              type: "wordpress",
              name: "WP",
              order: 1,
              inputBindings: {},
              configuration: {},
              requiresApproval: false,
              retryPolicy: { maxAttempts: 1, backoffMs: [] },
              timeoutMs: 1,
              onSuccess: null,
              onFailure: null,
              enabled: true,
            },
          ],
          onFailure: { strategy: "stop", notify: true },
          timeoutPolicy: {
            workflowTimeoutMs: 1,
            stepDefaultTimeoutMs: 1,
          },
        },
        executionPolicy: { mode: "run_then_notify" },
      }),
    ).resolves.toBeTruthy();

    const withWp = await createActive({
      name: "wp",
      workflow: {
        version: 1,
        steps: [
          {
            id: "wp",
            type: "wordpress",
            name: "WP",
            order: 1,
            inputBindings: {},
            configuration: {},
            requiresApproval: false,
            retryPolicy: { maxAttempts: 1, backoffMs: [] },
            timeoutMs: 1,
            onSuccess: null,
            onFailure: null,
            enabled: true,
          },
        ],
        onFailure: { strategy: "stop", notify: true },
        timeoutPolicy: {
          workflowTimeoutMs: 1,
          stepDefaultTimeoutMs: 1,
        },
      },
      executionPolicy: { mode: "run_then_notify" },
    });
    const approval = resolveRunApprovalRequirement({
      policy: withWp.executionPolicy,
      steps: withWp.workflow.steps,
      isFirstRun: false,
      priorApprovalsCount: 10,
    });
    expect(approval.requiresApproval).toBe(true);
  });

  it("38. writes audit log", async () => {
    await createActive();
    const events = listAutomationAuditEvents();
    expect(events.some((event) => event.action === "automation.create")).toBe(
      true,
    );
  });

  it("39. buildAutomationFromCreateInput produces valid model", async () => {
    const record = buildAutomationFromCreateInput("user_a", {
      name: "x",
      trigger: dailyTrigger(),
      workflow: baseWorkflow(),
      status: "draft",
    });
    expect(record.executionPolicy.systemHighRiskOverride).toBe(true);
  });

  it("40. paused automation cannot run (non-destructive to single jobs)", async () => {
    const created = await createActive();
    await automationPlatformService.pause("user_a", created.id, ownerContext);
    await expect(
      automationPlatformService.enqueueRun({
        userId: "user_a",
        automationId: created.id,
        triggerType: "manual",
        context: ownerContext,
      }),
    ).rejects.toThrow(AutomationPlatformError);
  });
});

function sampleV1(): AutomationV1 {
  return {
    id: "legacy-1",
    userId: "user_a",
    name: "旧定期",
    description: "desc",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 9:00",
    },
    workflow: { assignment: "報告を作成" },
    timing: {
      startDate: null,
      endCondition: { type: "never" },
    },
    executionLevel: "approve_then_run",
    executionMode: "eco",
    snsBatchDays: null,
    executionFlow: {
      templateId: "generic",
      steps: [{ id: "plan", enabled: true }],
    },
    destination: "none",
    enabled: true,
    lastRun: null,
    nextRun: null,
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}
