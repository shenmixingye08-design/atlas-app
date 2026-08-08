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
  createNotification: vi.fn(() => ({ notificationId: "n1" })),
}));

import { resetAutomationAuditLogForTests } from "@/lib/automation-platform/audit/log";
import {
  computeRetryAt,
  isRetryableFailure,
} from "@/lib/automation-platform/execution/retry-policy";
import { resolveRunApprovalRequirement } from "@/lib/automation-platform/execution/policy";
import { normalizeExecutionPolicy } from "@/lib/automation-platform/execution/policy";
import { resetAutomationV2DbStoreForTests } from "@/lib/automation-platform/repository/db-store";
import { resetAutomationPlatformStoreForTests } from "@/lib/automation-platform/repository/memory-store";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";

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

async function createActive(
  patch: Partial<CreateAutomationV2Input> = {},
) {
  return automationPlatformService.create(
    "user_exec",
    {
      name: "実行テスト",
      status: "active",
      trigger: {
        type: "manual",
        timezone: "Asia/Tokyo",
        schedule: null,
        event: null,
        condition: null,
      },
      workflow: workflow([
        {
          id: "s1",
          type: "excel_generate",
          name: "Excel",
          order: 1,
          inputBindings: {},
          configuration: { title: "売上" },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 2, backoffMs: [1000] },
          timeoutMs: 10_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
        {
          id: "s2",
          type: "pdf_generate",
          name: "PDF",
          order: 2,
          inputBindings: {},
          configuration: { title: "報告" },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 2, backoffMs: [1000] },
          timeoutMs: 10_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
      ]),
      executionPolicy: { mode: "run_then_notify" },
      ...patch,
    },
    ownerContext,
  );
}

describe("Automation Execution System", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetAutomationV2DbStoreForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    enableFlags();
  });

  it("prepare → execute → succeed with step timeline", async () => {
    const automation = await createActive();
    const { run, created } = await automationPlatformService.enqueueRun({
      userId: "user_exec",
      automationId: automation.id,
      triggerType: "manual",
      context: ownerContext,
    });
    expect(created).toBe(true);
    expect(run.status).toBe("succeeded");
    expect(run.preparation?.summary).toContain("Excel");
    expect(run.steps.every((step) => step.status === "succeeded")).toBe(true);
    expect(run.artifacts.length).toBeGreaterThan(0);
    expect(run.memoryUsage.updated).toEqual([]);
    expect(run.durationMs).not.toBeNull();
  });

  it("approval gate then one-tap approve executes", async () => {
    const automation = await createActive({
      executionPolicy: { mode: "review_before_run" },
    });
    const enqueued = await automationPlatformService.enqueueRun({
      userId: "user_exec",
      automationId: automation.id,
      triggerType: "manual",
      context: ownerContext,
    });
    expect(enqueued.run.status).toBe("awaiting_approval");
    expect(enqueued.run.approval?.status).toBe("pending");

    const approved = await automationPlatformService.approveRun(
      "user_exec",
      enqueued.run.id,
      ownerContext,
    );
    expect(approved.status).toBe("succeeded");
    expect(approved.approval?.status).toBe("approved");
  });

  it("cannot skip high-risk approval even on run_then_notify", async () => {
    const automation = await createActive({
      executionPolicy: { mode: "run_then_notify" },
      workflow: workflow([
        {
          id: "x1",
          type: "x_post",
          name: "X投稿",
          order: 1,
          inputBindings: {},
          configuration: { text: "hello" },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [] },
          timeoutMs: 10_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
      ]),
    });
    const enqueued = await automationPlatformService.enqueueRun({
      userId: "user_exec",
      automationId: automation.id,
      triggerType: "manual",
      context: ownerContext,
    });
    expect(enqueued.run.status).toBe("awaiting_approval");
  });

  it("post-only and send-only modes", () => {
    const steps = [
      {
        id: "e",
        type: "excel_generate" as const,
        name: "Excel",
        order: 1,
        inputBindings: {},
        configuration: {},
        requiresApproval: false,
        retryPolicy: { maxAttempts: 1, backoffMs: [] },
        timeoutMs: 1000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      },
      {
        id: "x",
        type: "x_post" as const,
        name: "X",
        order: 2,
        inputBindings: {},
        configuration: {},
        requiresApproval: false,
        retryPolicy: { maxAttempts: 1, backoffMs: [] },
        timeoutMs: 1000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      },
      {
        id: "g",
        type: "gmail" as const,
        name: "Mail",
        order: 3,
        inputBindings: {},
        configuration: {},
        requiresApproval: false,
        retryPolicy: { maxAttempts: 1, backoffMs: [] },
        timeoutMs: 1000,
        onSuccess: null,
        onFailure: null,
        enabled: true,
      },
    ];
    const post = resolveRunApprovalRequirement({
      policy: normalizeExecutionPolicy({ mode: "review_post_only" }),
      steps,
      isFirstRun: false,
      priorApprovalsCount: 1,
    });
    expect(post.requiresApproval).toBe(true);
    expect(post.stepIds).toContain("x");
    expect(post.stepIds).toContain("g"); // high-risk override still includes gmail

    const send = resolveRunApprovalRequirement({
      policy: normalizeExecutionPolicy({ mode: "review_send_only" }),
      steps,
      isFirstRun: false,
      priorApprovalsCount: 1,
    });
    expect(send.stepIds).toContain("g");
  });

  it("retry policy uses backoff with finite attempts", () => {
    expect(
      isRetryableFailure({
        errorCode: "automation_timeout",
        errorMessage: "timeout",
      }),
    ).toBe(true);
    expect(
      isRetryableFailure({
        errorCode: null,
        errorMessage: "429 rate limit",
      }),
    ).toBe(true);
    expect(
      isRetryableFailure({
        errorCode: null,
        errorMessage: "permission denied",
      }),
    ).toBe(false);
    expect(
      computeRetryAt({ attemptCount: 1, maxAttempts: 3, nowMs: 1_000_000 }),
    ).toBeTruthy();
    expect(
      computeRetryAt({ attemptCount: 3, maxAttempts: 3, nowMs: 1_000_000 }),
    ).toBeNull();
  });

  it("rejects double claim of same run identity via occurrence", async () => {
    const automation = await createActive({
      executionPolicy: { mode: "run_then_notify" },
      trigger: {
        type: "schedule",
        timezone: "Asia/Tokyo",
        schedule: {
          frequency: "daily",
          hour: 9,
          minute: 0,
        },
        event: null,
        condition: null,
      },
    });
    const scheduledFor = "2026-08-01T00:00:00.000Z";
    const first = await automationPlatformService.enqueueRun({
      userId: "user_exec",
      automationId: automation.id,
      triggerType: "schedule",
      scheduledFor,
      context: ownerContext,
      dispatch: false,
    });
    const second = await automationPlatformService.enqueueRun({
      userId: "user_exec",
      automationId: automation.id,
      triggerType: "schedule",
      scheduledFor,
      context: ownerContext,
      dispatch: false,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);
  });

  it("memory is never rewritten by execution", async () => {
    const { createPersonalMemory } = await import(
      "@/lib/personal-memory/service"
    );
    await createPersonalMemory("user_exec", {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "短く" },
      title: "文体",
      summary: "短く",
      source: "explicit",
      status: "active",
    });
    const automation = await createActive({
      memoryPolicy: {
        enabled: true,
        allowedScopes: ["writing_style"],
        deniedScopes: [],
        lockedOverrides: {},
      },
    });
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_exec",
      automationId: automation.id,
      triggerType: "manual",
      context: ownerContext,
    });
    expect(run.memoryUsage.used.some((m) => m.scope === "writing_style")).toBe(
      true,
    );
    expect(run.memoryUsage.updated).toEqual([]);
    expect(run.memoryUsage.memoryIdsUsed?.length ?? 0).toBeGreaterThan(0);
  });
});
