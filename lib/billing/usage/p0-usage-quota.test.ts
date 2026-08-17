import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => {
    if (userId.startsWith("owner_")) return "owner@atlas.test";
    return `${userId}@example.com`;
  }),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    Boolean(email?.startsWith("owner@") && email.endsWith("@atlas.test")),
}));

vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-${automation.id}`,
    registered: true,
  })),
}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(() => ({ notificationId: "n1" })),
}));

import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { resetAutomationPlatformStoreForTests } from "@/lib/automation-platform/repository/memory-store";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";
import { consumeBillingAiJob, requireAndConsumeAiJob } from "@/lib/billing/access/enforce";
import { applySubscriptionFromStripe } from "@/lib/billing/subscriptions/service";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { formatUsageHeadline } from "@/lib/billing/usage-awareness/copy";
import {
  resolveUsageDisplay,
  USAGE_UNAVAILABLE_MESSAGE,
} from "@/lib/billing/usage-awareness/load-state";
import { buildUsageAwarenessView } from "@/lib/billing/usage-awareness/view";
import { listPlanDefinitions } from "@/lib/billing/plans/registry";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";

import { consumeAiJobQuota } from "./ai-job";
import { countBillableAutomations } from "./automation-inventory";
import { resetAutomationSlotsForTests } from "./automation-slots";
import { hydrateUserUsageMeters } from "./hydrate";
import { getUsageMonthKey } from "./period";
import {
  resetAiQuotaEngineForTests,
  seedAiRunsForTests,
} from "./quota-engine";
import { getUserUsageLimitSummary } from "./service";
import { resetUsageStore } from "./store";

const openaiCreate = vi.fn(async () => ({ id: "resp_test" }));

async function runGuardedOpenAi(userId: string, claimKey: string) {
  const denied = await consumeBillingAiJob(userId, claimKey);
  if (denied) {
    return { ok: false as const, status: denied.status, openaiCalled: false };
  }
  await openaiCreate();
  return { ok: true as const, openaiCalled: true };
}

async function setPlan(
  userId: string,
  planId: "free" | "light" | "standard" | "premium",
) {
  await applySubscriptionFromStripe({
    userId,
    stripeCustomerId: `cus_${userId}`,
    stripeSubscriptionId: `sub_${userId}`,
    planId,
    status: "active",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

function userContext() {
  return buildFeatureAccessContext("member@example.com");
}

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

async function createAutomation(userId: string, name: string) {
  return automationPlatformService.create(
    userId,
    {
      name,
      description: "利用上限テスト",
      status: "active",
      trigger: {
        type: "schedule",
        timezone: "Asia/Tokyo",
        schedule: { frequency: "daily", hour: 9, minute: 0 },
        event: null,
        condition: null,
      },
      workflow: baseWorkflow(),
      executionPolicy: { mode: "run_then_notify" },
      instruction: {
        structuredOptions: { generatePdf: true },
        freeformNotes: "簡潔に",
      },
      rejectOnConflict: false,
    },
    userContext(),
  );
}

async function usageFraction(userId: string) {
  await hydrateUserUsageMeters(userId);
  const summary = getUserUsageLimitSummary(userId);
  return {
    ai: `${summary.aiRuns.used} / ${summary.aiRuns.limit}`,
    automation: `${summary.automationTasks.used} / ${summary.automationTasks.limit}`,
    aiUsed: summary.aiRuns.used,
    aiLimit: summary.aiRuns.limit,
    automationUsed: summary.automationTasks.used,
    automationLimit: summary.automationTasks.limit,
  };
}

describe("P0 usage metering — regular Light user", () => {
  beforeEach(async () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    openaiCreate.mockClear();
    resetSubscriptionStore();
    resetUsageStore();
    resetAiQuotaEngineForTests();
    resetAutomationSlotsForTests();
    resetAutomationPlatformStoreForTests();
    const { resetAutomationV2DbStoreForTests } = await import(
      "@/lib/automation-platform/repository/db-store"
    );
    resetAutomationV2DbStoreForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    enableV2Flags();
  });

  it("Automation 0/3 → 1/3 → 2/3 → 3/3 → 4th server-side reject", async () => {
    const userId = "user_light_auto";
    await setPlan(userId, "light");
    expect(await usageFraction(userId)).toMatchObject({
      automation: "0 / 3",
    });

    await createAutomation(userId, "自動化1");
    expect(await countBillableAutomations(userId)).toBe(1);
    expect(await usageFraction(userId)).toMatchObject({ automation: "1 / 3" });

    await createAutomation(userId, "自動化2");
    expect(await usageFraction(userId)).toMatchObject({ automation: "2 / 3" });

    const third = await createAutomation(userId, "自動化3");
    expect(await usageFraction(userId)).toMatchObject({ automation: "3 / 3" });

    await expect(createAutomation(userId, "自動化4")).rejects.toMatchObject({
      code: "automation_quota_exceeded",
      httpStatus: 429,
    });
    expect(await countBillableAutomations(userId)).toBe(3);
    expect(await usageFraction(userId)).toMatchObject({ automation: "3 / 3" });
    expect(third.name).toBe("自動化3");
  });

  it("Direct API 4th create is refused without UI", async () => {
    const userId = "user_light_direct_auto";
    await setPlan(userId, "light");
    await createAutomation(userId, "A");
    await createAutomation(userId, "B");
    await createAutomation(userId, "C");
    try {
      await createAutomation(userId, "D");
      throw new Error("4th create must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AutomationPlatformError);
      expect((error as AutomationPlatformError).code).toBe(
        "automation_quota_exceeded",
      );
    }
    expect(await countBillableAutomations(userId)).toBe(3);
  });

  it("Client-supplied huge limits cannot create a 4th automation", async () => {
    const userId = "user_light_tamper";
    await setPlan(userId, "light");
    await createAutomation(userId, "A");
    await createAutomation(userId, "B");
    await createAutomation(userId, "C");
    await expect(
      createAutomation(userId, "tampered"),
    ).rejects.toBeInstanceOf(AutomationPlatformError);
    expect(await countBillableAutomations(userId)).toBe(3);
  });

  it("Concurrent creates at 2/3 allow only one success", async () => {
    const userId = "user_light_auto_race";
    await setPlan(userId, "light");
    await createAutomation(userId, "A");
    await createAutomation(userId, "B");
    const results = await Promise.allSettled([
      createAutomation(userId, "C1"),
      createAutomation(userId, "C2"),
    ]);
    const fulfilled = results.filter((row) => row.status === "fulfilled");
    const rejected = results.filter((row) => row.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await countBillableAutomations(userId)).toBe(3);
    expect(await usageFraction(userId)).toMatchObject({ automation: "3 / 3" });
  });

  it("Archived automation frees a slot; downgrade keeps extras and blocks new", async () => {
    const userId = "user_downgrade_auto";
    await setPlan(userId, "premium");
    const kept = [];
    for (let i = 1; i <= 5; i += 1) {
      kept.push(await createAutomation(userId, `P${i}`));
    }
    expect(await countBillableAutomations(userId)).toBe(5);

    await setPlan(userId, "light");
    expect(await usageFraction(userId)).toMatchObject({
      automation: "5 / 3",
    });
    await expect(createAutomation(userId, "extra")).rejects.toMatchObject({
      code: "automation_quota_exceeded",
    });
    expect(await countBillableAutomations(userId)).toBe(5);

    await automationPlatformService.archive(userId, kept[0]!.id, userContext());
    await automationPlatformService.archive(userId, kept[1]!.id, userContext());
    await automationPlatformService.archive(userId, kept[2]!.id, userContext());
    expect(await countBillableAutomations(userId)).toBe(2);
    await expect(createAutomation(userId, "after-archive")).resolves.toBeTruthy();
    expect(await countBillableAutomations(userId)).toBe(3);
    await expect(createAutomation(userId, "still-full")).rejects.toMatchObject({
      code: "automation_quota_exceeded",
    });
  });

  it("Upgrade keeps used AI/automation counts and raises limits", async () => {
    const userId = "user_upgrade";
    await setPlan(userId, "light");
    seedAiRunsForTests(userId, 18);
    await createAutomation(userId, "A");
    await createAutomation(userId, "B");
    await createAutomation(userId, "C");
    expect(await usageFraction(userId)).toMatchObject({
      ai: "18 / 30",
      automation: "3 / 3",
    });

    await setPlan(userId, "standard");
    expect(await usageFraction(userId)).toMatchObject({
      ai: "18 / 100",
      automation: "3 / 10",
    });
  });

  it("AI 29/30 → 30th success → 31st refused and OpenAI is not called", async () => {
    const userId = "user_light_ai";
    await setPlan(userId, "light");
    seedAiRunsForTests(userId, 29);
    expect(await usageFraction(userId)).toMatchObject({ ai: "29 / 30" });

    const thirtieth = await runGuardedOpenAi(userId, "job-30");
    expect(thirtieth.ok).toBe(true);
    expect(thirtieth.openaiCalled).toBe(true);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(await usageFraction(userId)).toMatchObject({ ai: "30 / 30" });

    const thirtyFirst = await runGuardedOpenAi(userId, "job-31");
    expect(thirtyFirst.ok).toBe(false);
    expect(thirtyFirst.status).toBe(429);
    expect(thirtyFirst.openaiCalled).toBe(false);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(await usageFraction(userId)).toMatchObject({ ai: "30 / 30" });
  });

  it("Direct API 31st AI job is refused", async () => {
    const userId = "user_light_ai_direct";
    await setPlan(userId, "light");
    seedAiRunsForTests(userId, 30);
    const denied = await requireAndConsumeAiJob(userId, "work_job", "job-31");
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(429);
    expect(await usageFraction(userId)).toMatchObject({ ai: "30 / 30" });
  });

  it("Concurrent AI at 29/30 allows only one success and never 31", async () => {
    const userId = "user_light_ai_race";
    await setPlan(userId, "light");
    seedAiRunsForTests(userId, 29);
    const results = await Promise.all([
      runGuardedOpenAi(userId, "race-a"),
      runGuardedOpenAi(userId, "race-b"),
    ]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    expect(results.filter((row) => !row.ok)).toHaveLength(1);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(await usageFraction(userId)).toMatchObject({ ai: "30 / 30" });
  });

  it("Retry with the same claimKey does not double-count", async () => {
    const userId = "user_light_ai_idem";
    await setPlan(userId, "light");
    const first = await consumeAiJobQuota({
      userId,
      claimKey: "work_job:same",
    });
    const retry = await consumeAiJobQuota({
      userId,
      claimKey: "work_job:same",
    });
    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.idempotent).toBe(true);
    }
    expect(await usageFraction(userId)).toMatchObject({ ai: "1 / 30" });
  });

  it("Owner bypass is separate from regular-user enforcement", async () => {
    const ownerId = "owner_admin";
    await setPlan(ownerId, "light");
    seedAiRunsForTests(ownerId, 30);
    const reserved = await consumeAiJobQuota({
      userId: ownerId,
      claimKey: "owner-extra",
    });
    expect(reserved.ok).toBe(true);
    expect(reserved.limit).toBe(Number.POSITIVE_INFINITY);
  });

  it("JST calendar month is the usage period", () => {
    expect(getUsageMonthKey(new Date("2026-08-31T14:00:00.000Z"))).toBe(
      "2026-08",
    );
    expect(getUsageMonthKey(new Date("2026-08-31T16:00:00.000Z"))).toBe(
      "2026-09",
    );
  });

  it("Usage UI never treats a failed load as 0", () => {
    expect(
      resolveUsageDisplay({ ready: false, used: 0, limit: 30 }),
    ).toEqual({
      kind: "unavailable",
      message: USAGE_UNAVAILABLE_MESSAGE,
    });
    expect(
      resolveUsageDisplay({ ready: true, used: 0, limit: 30 }),
    ).toEqual({ kind: "ready", used: 0, limit: 30 });
  });

  it("UI awareness and enforcement share registry limits", async () => {
    const userId = "user_light_ui";
    await setPlan(userId, "light");
    seedAiRunsForTests(userId, 7);
    await createAutomation(userId, "A");
    await createAutomation(userId, "B");
    await hydrateUserUsageMeters(userId);
    const summary = getUserUsageLimitSummary(userId);
    const view = buildUsageAwarenessView({
      usage: summary,
      catalog: listPlanDefinitions(),
    });
    const ai = view.items.find((item) => item.id === "aiRuns")!;
    const automation = view.items.find((item) => item.id === "automationTasks")!;
    expect(`${ai.used} / ${ai.limit}`).toBe("7 / 30");
    expect(`${automation.used} / ${automation.limit}`).toBe("2 / 3");
    expect(formatUsageHeadline({ ...ai, level: "exhausted" })).toContain(
      "30回",
    );
  });
});
