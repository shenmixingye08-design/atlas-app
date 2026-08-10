import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
  SUPABASE_ONLY_DOMAIN_KEYS: new Set(["atlasPersonalMemory"]),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-shadow-${automation.id}`,
    registered: true,
  })),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(() => ({ notificationId: "n1" })),
}));

import {
  CANONICAL_STATUS_LABEL,
  mergeCanonicalAutomations,
  resolveAutomationIdTarget,
  toCanonicalFromV1,
  toCanonicalFromV2,
} from "@/lib/automations/canonical";
import type { Automation } from "@/lib/automations/types";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";

function baseV1(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "v1-1",
    name: "朝の要約",
    description: "desc",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 09:00",
    },
    workflow: { assignment: "要約を作成" },
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
    nextRun: "2099-01-02T00:00:00.000Z",
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    userId: "user_a",
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseV2(overrides: Partial<AutomationV2> = {}): AutomationV2 {
  return {
    id: "v2-1",
    userId: "user_a",
    name: "新しい自動化",
    description: "",
    status: "active",
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: { frequency: "daily", hour: 9, minute: 0 },
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps: [],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 900_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: {
      mode: "run_then_notify",
      systemHighRiskOverride: true,
      requireConfirmationFor: [],
    },
    notificationPolicy: {
      onSuccess: true,
      onFailure: true,
      beforeRun: false,
    },
    instruction: {
      freeformNotes: "要約",
      structuredOptions: {},
      lockedFields: [],
    },
    memoryPolicy: {
      enabled: true,
      scopes: [],
      lockedOverrides: {},
    },
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: "2099-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as AutomationV2;
}

describe("N-08 canonical automation model", () => {
  it("uses unified user-facing status labels", () => {
    expect(CANONICAL_STATUS_LABEL.active).toBe("有効");
    expect(CANONICAL_STATUS_LABEL.paused).toBe("一時停止");
    expect(CANONICAL_STATUS_LABEL.running).toBe("実行中");
    expect(CANONICAL_STATUS_LABEL.completed).toBe("完了");
    expect(CANONICAL_STATUS_LABEL.failed).toBe("失敗");
    expect(CANONICAL_STATUS_LABEL.archived).toBe("削除済み");
  });

  it("normalizes v1/v2 without exposing generation in href", () => {
    const c1 = toCanonicalFromV1(baseV1());
    const c2 = toCanonicalFromV2(baseV2());
    expect(c1.href).toBe("/automations?id=v1-1");
    expect(c2.href).toBe("/automations?id=v2-1");
    expect(c1.href).not.toContain("v2=");
    expect(c2.deleteSemantics).toBe("archive");
    expect(c1.deleteSemantics).toBe("soft_delete");
  });

  it("dedupes v1 shadow rows behind v2", () => {
    const v1 = baseV1({ id: "shadow-1" });
    const v2 = baseV2({
      id: "v2-main",
      legacyAutomationId: "shadow-1",
    });
    const merged = mergeCanonicalAutomations({ v1: [v1], v2: [v2] });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("v2-main");
  });

  it("resolves ?id= preferring v2", () => {
    const v1 = baseV1({ id: "same-id" });
    const v2 = baseV2({ id: "same-id" });
    expect(
      resolveAutomationIdTarget("same-id", { v1: [v1], v2: [v2] }),
    ).toEqual({ generation: "v2", id: "same-id" });
  });
});

describe("N-08 v1 soft-delete + pause/resume", () => {
  beforeEach(async () => {
    process.env.ATLAS_AUTOMATION_STORAGE = "memory_durable";
    const { resetAutomationStore } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import(
      "@/lib/automations/global-durable"
    );
    const { resetDurableAutomationDefinitionsForTests } = await import(
      "@/lib/automations/durable-automation-definitions"
    );
    resetAutomationStore({ seed: false });
    resetDurableAutomationDefinitionsForTests();
    resetAutomationsGlobalDurableForTests();
  });

  afterEach(() => {
    delete process.env.ATLAS_AUTOMATION_STORAGE;
  });

  it("supports create/read/update/pause/resume/delete with clear delete semantics", async () => {
    const { automationService } = await import(
      "@/lib/automations/automation-service"
    );
    const userId = "n08_user";
    const created = await automationService.createForUser(userId, {
      name: "削除テスト",
      description: "d",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 10, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 10:00",
      },
      workflow: { assignment: "作成" },
      enabled: true,
    });

    const listed = await automationService.listForUser(userId);
    expect(listed.some((row) => row.id === created.id)).toBe(true);

    const updated = await automationService.updateForUser(created.id, userId, {
      name: "編集後",
    });
    expect(updated?.name).toBe("編集後");

    const paused = await automationService.setEnabledForUser(
      created.id,
      userId,
      false,
    );
    expect(paused?.enabled).toBe(false);
    expect(paused?.nextRun).toBeNull();

    const resumed = await automationService.setEnabledForUser(
      created.id,
      userId,
      true,
    );
    expect(resumed?.enabled).toBe(true);
    expect(resumed?.nextRun).toBeTruthy();

    const deleted = await automationService.deleteForUser(created.id, userId);
    expect(deleted).toBe(true);
    const after = await automationService.listForUser(userId);
    expect(after.some((row) => row.id === created.id)).toBe(false);

    const cross = await automationService.deleteForUser(created.id, "other");
    expect(cross).toBe(false);
  });
});

describe("N-08 production probe wiring", () => {
  beforeEach(async () => {
    process.env.ATLAS_AUTOMATION_STORAGE = "memory_durable";
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    const { resetAutomationStore } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import(
      "@/lib/automations/global-durable"
    );
    const { resetDurableAutomationDefinitionsForTests } = await import(
      "@/lib/automations/durable-automation-definitions"
    );
    const { resetAutomationPlatformStoreForTests } = await import(
      "@/lib/automation-platform/repository/memory-store"
    );
    const { resetAutomationsV2DurableForTests } = await import(
      "@/lib/automation-platform/durable"
    );
    const { resetAutomationV2DbStoreForTests } = await import(
      "@/lib/automation-platform/repository/db-store"
    );
    const { resetAutomationRateLimitForTests } = await import(
      "@/lib/automation-platform/security/rate-limit"
    );
    resetAutomationStore({ seed: false });
    resetDurableAutomationDefinitionsForTests();
    resetAutomationsGlobalDurableForTests();
    resetAutomationPlatformStoreForTests();
    resetAutomationsV2DurableForTests();
    resetAutomationV2DbStoreForTests();
    resetAutomationRateLimitForTests();
  });

  it("probe reports all required flags true in durable memory mode", async () => {
    const { probeN08AutomationUnifyProduction } = await import(
      "@/lib/automations/canonical/n08-automation-unify-production-probe"
    );
    const result = await probeN08AutomationUnifyProduction();
    if (!result.ok) {
      // Surface which flags failed for faster diagnosis.
      expect(result).toMatchObject({ ok: true, error: null });
    }
    expect(result.canonicalModelOk).toBe(true);
    expect(result.legacyReadOk).toBe(true);
    expect(result.legacyExecuteOk).toBe(true);
    expect(result.newExecuteOk).toBe(true);
    expect(result.createUnifiedOk).toBe(true);
    expect(result.editUnifiedOk).toBe(true);
    expect(result.pauseResumeUnifiedOk).toBe(true);
    expect(result.deleteSemanticsOk).toBe(true);
    expect(result.memoryV1Ok).toBe(true);
    expect(result.memoryV2Ok).toBe(true);
    expect(result.schedulerCompatibleOk).toBe(true);
    expect(result.workerCompatibleOk).toBe(true);
    expect(result.retrySafeOk).toBe(true);
    expect(result.idempotencyOk).toBe(true);
    expect(result.multiInstanceOk).toBe(true);
    expect(result.crossUserIsolatedOk).toBe(true);
    expect(result.userFacingV1V2HiddenOk).toBe(true);
    expect(result.ok).toBe(true);
  }, 60_000);
});
