import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-${automation.id}`,
    registered: true,
  })),
}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(() => ({ notificationId: "n1" })),
}));

import {
  resetAutomationPlatformStoreForTests,
  memoryGetAutomation,
  memoryListAutomationsForUser,
} from "@/lib/automation-platform/repository/memory-store";
import {
  dbClaimRun,
  dbGetAutomation,
  dbGetRun,
  dbInsertRun,
  dbListDueActiveAutomations,
  dbUpsertAutomation,
  resetAutomationV2DbStoreForTests,
} from "@/lib/automation-platform/repository/db-store";
import { resetAutomationsV2DurableForTests } from "@/lib/automation-platform/durable";
import { resetAutomationRunsV2DurableForTests } from "@/lib/automation-platform/durable-runs";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { processDueScheduledAutomationsV2 } from "@/lib/automation-platform/schedule/due-tick";
import { resetAutomationAuditLogForTests } from "@/lib/automation-platform/audit/log";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import type {
  AutomationRun,
  AutomationV2,
  CreateAutomationV2Input,
} from "@/lib/automation-platform/types";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

const ownerContext: FeatureAccessContext = {
  email: "owner@atlas.test",
  isOwner: true,
  isBetaUser: true,
};

function enableV2Flags(): void {
  setFeatureFlagState("automation_v2_enabled", "on");
  setFeatureFlagState("automation_memory_enabled", "on");
  setFeatureFlagState("automation_approval_enabled", "on");
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

async function createActive(
  userId = "user_a",
  input?: Partial<CreateAutomationV2Input>,
): Promise<AutomationV2> {
  return automationPlatformService.create(
    userId,
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

function minimalRun(
  automation: AutomationV2,
  overrides?: Partial<AutomationRun>,
): AutomationRun {
  const now = new Date().toISOString();
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    automationId: automation.id,
    automationName: automation.name,
    userId: automation.userId,
    status: "queued",
    runKey: overrides?.runKey ?? `rk_${crypto.randomUUID()}`,
    idempotencyKey: overrides?.idempotencyKey ?? `ik_${crypto.randomUUID()}`,
    scheduleOccurrenceKey:
      overrides?.scheduleOccurrenceKey ?? `occ_${crypto.randomUUID()}`,
    triggerType: "schedule",
    scheduledFor: now,
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
    retryable: true,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: { used: [], updated: [], unusedScopes: [] },
    statusHistory: [],
    preparation: null,
    approval: null,
    steps: [],
    artifacts: [],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    memoryReferences: [],
    ...overrides,
  };
}

describe("P1-03 Automation V2 DB SoT", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("AUTOMATION_ALLOW_UNWIRED_EXTERNAL_ACTIVATION", "true");
    resetAutomationPlatformStoreForTests();
    resetAutomationV2DbStoreForTests();
    resetAutomationsV2DurableForTests();
    resetAutomationRunsV2DurableForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    enableV2Flags();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetAutomationPlatformStoreForTests();
    resetAutomationV2DbStoreForTests();
  });

  it("A: automation create persists to DB SoT", async () => {
    const created = await createActive();
    const fromDb = await dbGetAutomation(created.id);
    expect(fromDb?.id).toBe(created.id);
    expect(fromDb?.userId).toBe("user_a");
  });

  it("B: restart equivalent — empty memory, restore from DB", async () => {
    const created = await createActive();
    resetAutomationPlatformStoreForTests();
    expect(memoryListAutomationsForUser("user_a")).toHaveLength(0);
    const listed = await automationPlatformService.list("user_a", ownerContext);
    expect(listed.some((row) => row.id === created.id)).toBe(true);
  });

  it("C: update reflects in DB", async () => {
    const created = await createActive("user_a", { name: "before" });
    await automationPlatformService.update(
      "user_a",
      created.id,
      { name: "after" },
      ownerContext,
    );
    expect((await dbGetAutomation(created.id))?.name).toBe("after");
  });

  it("D: disable → not due for tick", async () => {
    const created = await createActive();
    await dbUpsertAutomation({
      ...created,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await automationPlatformService.pause("user_a", created.id, ownerContext);
    const due = await dbListDueActiveAutomations(Date.now(), 20);
    expect(due.find((row) => row.id === created.id)).toBeUndefined();
  });

  it("E: enable → due again", async () => {
    const created = await createActive();
    await automationPlatformService.pause("user_a", created.id, ownerContext);
    await automationPlatformService.resume("user_a", created.id, ownerContext);
    const resumed = await dbGetAutomation(created.id);
    expect(resumed?.status).toBe("active");
    // Make the resumed automation due now and confirm tick selection.
    await dbUpsertAutomation({
      ...resumed!,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const due = await dbListDueActiveAutomations(Date.now(), 20);
    expect(due.some((row) => row.id === created.id)).toBe(true);
  });

  it("F: same occurrence not double-enqueued", async () => {
    const created = await createActive();
    const occ = `occ_f_${created.id}`;
    const first = await dbInsertRun(
      minimalRun(created, { scheduleOccurrenceKey: occ }),
    );
    const second = await dbInsertRun(
      minimalRun(created, {
        id: crypto.randomUUID(),
        scheduleOccurrenceKey: occ,
        runKey: `rk_other_${Date.now()}`,
        idempotencyKey: `ik_other_${Date.now()}`,
      }),
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);
  });

  it("G: concurrent claim is single-winner", async () => {
    const created = await createActive();
    const run = minimalRun(created);
    await dbInsertRun(run);
    const [a, b] = await Promise.all([dbClaimRun(run.id), dbClaimRun(run.id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("H: run history stored in DB", async () => {
    const created = await createActive();
    const run = minimalRun(created, {
      status: "succeeded",
      resultSummary: "ok",
    });
    await dbInsertRun(run);
    expect((await dbGetRun(run.id))?.resultSummary).toBe("ok");
  });

  it("I: reclaim/retry consistency — lost claim does not duplicate", async () => {
    const created = await createActive();
    const run = minimalRun(created, {
      status: "retrying",
      nextRetryAt: new Date(0).toISOString(),
    });
    await dbInsertRun(run);
    expect((await dbClaimRun(run.id))?.status).toBe("running");
    expect(await dbClaimRun(run.id)).toBeNull();
  });

  it("J: User A cannot get/update User B automation", async () => {
    const created = await createActive("user_b");
    await expect(
      automationPlatformService.get("user_a", created.id, ownerContext),
    ).rejects.toMatchObject({ code: "automation_not_found" });
    await expect(
      automationPlatformService.update(
        "user_a",
        created.id,
        { name: "hijack" },
        ownerContext,
      ),
    ).rejects.toMatchObject({ code: "automation_not_found" });
  });

  it("K: memory-store empty still serves Automation from DB", async () => {
    const created = await createActive();
    resetAutomationPlatformStoreForTests();
    expect(memoryGetAutomation(created.id)).toBeNull();
    const got = await automationPlatformService.get(
      "user_a",
      created.id,
      ownerContext,
    );
    expect(got.id).toBe(created.id);
  });

  it("L: tick due scan uses DB (memory empty)", async () => {
    const created = await createActive();
    await dbUpsertAutomation({
      ...created,
      nextRunAt: new Date(Date.now() - 5_000).toISOString(),
    });
    resetAutomationPlatformStoreForTests();
    const tick = await processDueScheduledAutomationsV2({
      limit: 10,
      dispatch: false,
    });
    expect(tick.due).toBeGreaterThanOrEqual(1);
  });

  it("source: dispatch/due use DB claim — not memory claim helper", async () => {
    const fs = await import("node:fs/promises");
    const due = await fs.readFile(
      "lib/automation-platform/schedule/due-tick.ts",
      "utf8",
    );
    const dispatch = await fs.readFile(
      "lib/automation-platform/execution/dispatch.ts",
      "utf8",
    );
    const tick = await fs.readFile("app/api/automations/tick/route.ts", "utf8");
    expect(due).toContain("dbListDueActiveAutomations");
    expect(dispatch).toContain("dbClaimRun");
    expect(dispatch).not.toContain("memoryClaimRun");
    expect(tick).toContain("isAutomationV2DbSotReady");
    // N-08 / unattended gate: V2 due path must run before legacy V1 work_queue
    // so a work_queue throw cannot block natural scheduler V2 execution.
    const v2Idx = tick.indexOf("processDueScheduledAutomationsV2");
    const v1Idx = tick.indexOf("processWorkQueueTick");
    expect(v2Idx).toBeGreaterThanOrEqual(0);
    expect(v1Idx).toBeGreaterThan(v2Idx);
    expect(tick).toContain("workQueueFailure");
  });
});
