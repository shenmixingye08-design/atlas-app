import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => {
    if (userId.startsWith("owner_")) return "owner@atlas.test";
    return `${userId}@example.com`;
  }),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    Boolean(email?.endsWith("@atlas.test") && email.startsWith("owner@")),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

describe("usage metering + server-side plan enforcement", () => {
  beforeEach(async () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    const { resetBillingUsageDurableForTests } = await import(
      "@/lib/billing/usage/durable"
    );
    const { resetAutomationPlatformStoreForTests } = await import(
      "@/lib/automation-platform/repository/memory-store"
    );
    const { resetAutomationV2DbStoreForTests } = await import(
      "@/lib/automation-platform/repository/db-store"
    );
    const { resetAutomationsV2DurableForTests } = await import(
      "@/lib/automation-platform/durable"
    );
    resetSubscriptionStore();
    resetUsageStore();
    resetBillingUsageDurableForTests();
    resetAutomationPlatformStoreForTests();
    resetAutomationV2DbStoreForTests();
    resetAutomationsV2DurableForTests();
  });

  async function setPlan(
    userId: string,
    planId: "free" | "light" | "standard" | "premium",
  ) {
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
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

  it("defines AI作業 as monthly user-facing AI runs and 自動化 as active tasks", async () => {
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");
    const light = getPlanDefinition("light");
    expect(light.limits.aiUsageMonthly).toBe(30);
    expect(light.limits.automationTasks).toBe(3);
  });

  it("uses Asia/Tokyo calendar months for reset labels", async () => {
    const { formatUsageResetLabel, nextUsageResetAt } = await import(
      "@/lib/billing/usage-awareness/reset"
    );
    expect(formatUsageResetLabel("2026-08")).toBe("9月1日にリセットされます");
    expect(nextUsageResetAt("2026-08")).toBe("2026-09-01T00:00:00+09:00");
  });

  it("AI作業: 1 success → 1/limit, 31st is denied, retry does not double-count", async () => {
    await setPlan("user_ai", "light");
    const { recordUserAiUsageOnce } = await import("@/lib/billing/usage/meter");
    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );
    const { tryConsumeAiRunQuota } = await import("@/lib/billing/usage/store");
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");

    const first = recordUserAiUsageOnce({
      userId: "user_ai",
      api: "responses",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 10,
      outputTokens: 5,
      claimKey: "job-1",
    });
    expect(first.allowed).toBe(true);
    expect(first.recorded).toBe(true);
    expect(getUserUsageLimitSummary("user_ai").aiRuns.used).toBe(1);

    const retry = recordUserAiUsageOnce({
      userId: "user_ai",
      api: "responses",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 10,
      outputTokens: 5,
      claimKey: "job-1",
    });
    expect(retry.allowed).toBe(true);
    expect(retry.recorded).toBe(false);
    expect(getUserUsageLimitSummary("user_ai").aiRuns.used).toBe(1);

    const limit = getPlanDefinition("light").limits.aiUsageMonthly;
    for (let i = 2; i <= limit; i += 1) {
      const result = tryConsumeAiRunQuota({
        userId: "user_ai",
        claimKey: `job-${i}`,
        limit,
      });
      expect(result.allowed).toBe(true);
    }
    expect(getUserUsageLimitSummary("user_ai").aiRuns.used).toBe(limit);
    expect(getUserUsageLimitSummary("user_ai").aiRuns.remaining).toBe(0);

    const overflow = tryConsumeAiRunQuota({
      userId: "user_ai",
      claimKey: "job-overflow",
      limit,
    });
    expect(overflow.allowed).toBe(false);
    expect(getUserUsageLimitSummary("user_ai").aiRuns.used).toBe(limit);
  });

  it("requireBillingAiUsage reserves one slot and record does not double-count", async () => {
    await setPlan("user_req", "light");
    const { requireBillingAiUsage } = await import(
      "@/lib/billing/access/enforce"
    );
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );

    const denied = await requireBillingAiUsage("user_req");
    expect(denied).toBeNull();
    expect(getUserUsageLimitSummary("user_req").aiRuns.used).toBe(1);

    recordUserAiUsage({
      userId: "user_req",
      api: "responses",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 4,
      outputTokens: 2,
    });
    expect(getUserUsageLimitSummary("user_req").aiRuns.used).toBe(1);
    expect(getUserUsageLimitSummary("user_req").aiDetail.month.requests).toBe(1);
  });

  it("rejects the second concurrent requireBillingAiUsage when one slot remains", async () => {
    await setPlan("user_req_race", "light");
    const { incrementUsageCounter } = await import("@/lib/billing/usage/store");
    incrementUsageCounter("user_req_race", "aiRuns", 29);
    const { requireBillingAiUsage } = await import(
      "@/lib/billing/access/enforce"
    );

    const [first, second] = await Promise.all([
      requireBillingAiUsage("user_req_race"),
      requireBillingAiUsage("user_req_race"),
    ]);
    const denied = [first, second].filter((value) => value !== null);
    expect(denied).toHaveLength(1);
    expect(denied[0]?.status).toBe(429);

    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );
    expect(getUserUsageLimitSummary("user_req_race").aiRuns.used).toBe(30);
  });

  it("rejects the second concurrent consume when one slot remains", async () => {
    await setPlan("user_race", "light");
    const { tryConsumeAiRunQuota } = await import("@/lib/billing/usage/store");
    const { incrementUsageCounter } = await import("@/lib/billing/usage/store");
    incrementUsageCounter("user_race", "aiRuns", 29);

    const first = tryConsumeAiRunQuota({
      userId: "user_race",
      claimKey: "a",
      limit: 30,
    });
    const second = tryConsumeAiRunQuota({
      userId: "user_race",
      claimKey: "b",
      limit: 30,
    });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);

    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );
    expect(getUserUsageLimitSummary("user_race").aiRuns.used).toBe(30);
  });

  it("counts live active automations and denies the slot over the plan limit", async () => {
    await setPlan("user_auto", "light");
    const { persistAutomationV2Now } = await import(
      "@/lib/automation-platform/durable"
    );
    const { countActiveAutomationTasks, syncAutomationTaskUsage } = await import(
      "@/lib/billing/usage/automation-count"
    );
    const { evaluateBillingAutomationTask } = await import(
      "@/lib/billing/access/snapshot"
    );
    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );

    const base = {
      userId: "user_auto",
      description: "",
      trigger: {
        type: "manual" as const,
        timezone: "Asia/Tokyo",
        schedule: null,
        event: null,
        condition: null,
      },
      workflow: {
        version: 1,
        steps: [],
        onFailure: { strategy: "stop" as const, notify: true },
        timeoutPolicy: {
          workflowTimeoutMs: 900_000,
          stepDefaultTimeoutMs: 120_000,
        },
      },
      executionPolicy: {
        mode: "review_before_run" as const,
        systemHighRiskOverride: true as const,
        approvalTimeoutMs: null,
        onApprovalTimeout: "cancel" as const,
        selectedStepIds: [],
      },
      notificationPolicy: {
        onSuccess: true,
        onFailure: true,
        beforeRun: false,
        onNeedsInput: true,
        channels: ["in_app" as const],
      },
      instruction: { freeformNotes: "", structuredOptions: {} },
      memoryPolicy: {
        enabled: false,
        allowedScopes: [],
        deniedScopes: [],
        lockedOverrides: {},
      },
      legacyAutomationId: null,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(await countActiveAutomationTasks("user_auto")).toBe(0);

    for (let i = 1; i <= 3; i += 1) {
      await persistAutomationV2Now({
        ...base,
        id: `v2-${i}`,
        name: `自動化${i}`,
        status: "active",
        schemaVersion: 2,
      });
      await syncAutomationTaskUsage("user_auto");
      const summary = getUserUsageLimitSummary("user_auto", "light");
      expect(summary.automationTasks.used).toBe(i);
      expect(summary.automationTasks.limit).toBe(3);
    }

    const atLimit = await evaluateBillingAutomationTask("user_auto", 0);
    expect(atLimit.denial?.status).toBe(429);
    expect(atLimit.denial?.reason).toContain("3");

    await persistAutomationV2Now({
      ...base,
      id: "v2-paused",
      name: "停止中",
      status: "paused",
      schemaVersion: 2,
    });
    expect(await countActiveAutomationTasks("user_auto")).toBe(3);

    await persistAutomationV2Now({
      ...base,
      id: "v2-4",
      name: "超過",
      status: "active",
      schemaVersion: 2,
    });
    const over = await evaluateBillingAutomationTask("user_auto", 0);
    expect(over.denial).not.toBeNull();
  });

  it("does not count V1 scheduler shadows twice", async () => {
    await setPlan("user_shadow", "light");
    const { persistAutomationV2Now } = await import(
      "@/lib/automation-platform/durable"
    );
    const { automationService } = await import(
      "@/lib/automations/automation-service"
    );
    const { countActiveAutomationTasks } = await import(
      "@/lib/billing/usage/automation-count"
    );

    await persistAutomationV2Now({
      id: "v2-main",
      userId: "user_shadow",
      name: "本体",
      description: "",
      status: "active",
      trigger: {
        type: "manual",
        timezone: "Asia/Tokyo",
        schedule: null,
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
        mode: "review_before_run",
        systemHighRiskOverride: true,
        approvalTimeoutMs: null,
        onApprovalTimeout: "cancel",
        selectedStepIds: [],
      },
      notificationPolicy: {
        onSuccess: true,
        onFailure: true,
        beforeRun: false,
        onNeedsInput: true,
        channels: ["in_app"],
      },
      instruction: {
        freeformNotes: "",
        structuredOptions: { v1SchedulerId: "shadow-1" },
      },
      memoryPolicy: {
        enabled: false,
        allowedScopes: [],
        deniedScopes: [],
        lockedOverrides: {},
      },
      legacyAutomationId: "shadow-1",
      schemaVersion: 2,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await automationService.createForUser("user_shadow", {
      name: "shadow",
      description: "",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日",
      },
      workflow: { assignment: "投稿" },
      enabled: true,
    });
    const created = (await automationService.listForUser("user_shadow"))[0];
    if (created) {
      const { persistAutomationV2Now } = await import(
        "@/lib/automation-platform/durable"
      );
      const current = (
        await import("@/lib/automation-platform/repository/memory-store")
      ).memoryGetAutomation("v2-main");
      if (current) {
        await persistAutomationV2Now({
          ...current,
          instruction: {
            ...current.instruction,
            structuredOptions: { v1SchedulerId: created.id },
          },
          legacyAutomationId: created.id,
        });
      }
    }

    expect(await countActiveAutomationTasks("user_shadow")).toBe(1);
  });

  it("keeps used count and raises the limit on upgrade", async () => {
    await setPlan("user_up", "light");
    const { incrementUsageCounter } = await import("@/lib/billing/usage/store");
    incrementUsageCounter("user_up", "aiRuns", 3);
    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );
    expect(getUserUsageLimitSummary("user_up").aiRuns).toMatchObject({
      used: 3,
      limit: 30,
    });

    await setPlan("user_up", "standard");
    expect(getUserUsageLimitSummary("user_up").aiRuns).toMatchObject({
      used: 3,
      limit: 100,
    });
    expect(getUserUsageLimitSummary("user_up").automationTasks.limit).toBe(10);
  });

  it("does not accept a client-supplied plan or limit for enforcement", async () => {
    await setPlan("user_tamper", "light");
    const { checkAiUsageLimit } = await import("@/lib/billing/plans/policy");
    const { getUsageSnapshot, incrementUsageCounter } = await import(
      "@/lib/billing/usage/store"
    );
    incrementUsageCounter("user_tamper", "aiRuns", 30);
    const usage = getUsageSnapshot("user_tamper");
    expect(checkAiUsageLimit("light", usage).allowed).toBe(false);
    expect(checkAiUsageLimit("premium", usage).allowed).toBe(true);
    const { evaluateAiUsageAccess } = await import("@/lib/billing/policy");
    expect(evaluateAiUsageAccess("user_tamper").allowed).toBe(false);
  });

  it("marks unavailable usage instead of inventing zeros when production store is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const { ensureBillingUsageHydratedForUser } = await import(
      "@/lib/billing/usage/durable"
    );
    const result = await ensureBillingUsageHydratedForUser("user_prod");
    expect(result.available).toBe(false);
    expect(result.reason).toBe("usage_store_unavailable");
    vi.unstubAllEnvs();
  });
});
