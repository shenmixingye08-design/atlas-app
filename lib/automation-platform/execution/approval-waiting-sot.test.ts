/**
 * Regression: waiting_approval → approve → queued must work even when
 * process memory cache is stale (Production multi-instance SoT gap).
 *
 * Cases A–E required for Automation Phase 2 approval path.
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
  createNotification: vi.fn(() => ({ notificationId: "n1" })),
}));

import { resetAutomationAuditLogForTests } from "@/lib/automation-platform/audit/log";
import { resetAutomationRunsV2DurableForTests } from "@/lib/automation-platform/durable-runs";
import { dispatchAutomationRuns } from "@/lib/automation-platform/execution/dispatch";
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import {
  dbGetRun,
  resetAutomationV2DbStoreForTests,
} from "@/lib/automation-platform/repository/db-store";
import {
  memoryGetRun,
  memoryRestoreRun,
  resetAutomationPlatformStoreForTests,
} from "@/lib/automation-platform/repository/memory-store";
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

function highRiskGmailStep(): CreateAutomationV2Input["workflow"]["steps"][number] {
  return {
    id: "g1",
    type: "gmail",
    name: "Gmail",
    order: 1,
    inputBindings: {},
    configuration: { to: "boss@example.com", subject: "hi", body: "body" },
    requiresApproval: false,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

function googleCalendarStep(): CreateAutomationV2Input["workflow"]["steps"][number] {
  return {
    id: "cal1",
    type: "google_calendar",
    name: "Googleカレンダー",
    order: 1,
    inputBindings: {},
    configuration: {
      title: "MINERVOT自動化テスト",
      action: "create_event",
    },
    requiresApproval: false,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

async function createHighRiskAutomation(
  userId: string,
  steps: CreateAutomationV2Input["workflow"]["steps"],
  name = "high-risk",
) {
  return automationPlatformService.create(
    userId,
    {
      name,
      status: "active",
      trigger: {
        type: "manual",
        timezone: "Asia/Tokyo",
        schedule: null,
        event: null,
        condition: null,
      },
      workflow: workflow(steps),
      // NL wizard often lands on run_then_notify; system_high_risk_override
      // still forces awaiting_approval for Calendar / Gmail.
      executionPolicy: { mode: "run_then_notify", systemHighRiskOverride: true },
      instruction: {
        structuredOptions: {},
        freeformNotes:
          steps[0]?.type === "google_calendar"
            ? "毎日1時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して"
            : "メールを送って",
      },
    },
    ownerContext,
  );
}

function trackingInvoker(executed: string[]): StepInvoker {
  return async (input) => {
    executed.push(input.step.type);
    if (
      input.step.type === "gmail" ||
      input.step.type === "google_calendar" ||
      input.step.type === "x_post"
    ) {
      return {
        ok: true,
        summary: `${input.step.type} ok`,
        artifacts: [
          {
            id: `art_${input.step.type}_${executed.length}`,
            kind: "external" as const,
            label: input.step.type,
            externalId: `ext_${input.step.type}_${executed.length}`,
            url: null,
            createdAt: new Date().toISOString(),
          },
        ],
        evidence: {
          artifactIds: [`art_${input.step.type}_${executed.length}`],
          storageObjectIds: [],
          externalActionIds: [`ext_${input.step.type}_${executed.length}`],
          notificationIds: [],
        },
      };
    }
    return {
      ok: true,
      summary: "ok",
      artifacts: [
        {
          id: `art_${input.step.type}`,
          kind: "deliverable" as const,
          label: input.step.type,
          externalId: null,
          url: "https://example.com/file",
          createdAt: new Date().toISOString(),
        },
      ],
      evidence: {
        artifactIds: [`art_${input.step.type}`],
        storageObjectIds: [`art_${input.step.type}`],
        externalActionIds: [],
        notificationIds: [],
      },
    };
  };
}

/** Simulate warm serverless instance: memory status behind DB SoT. */
async function poisonMemoryStatus(
  runId: string,
  staleStatus: "preparing" | "queued" | "cancelled",
): Promise<void> {
  const sot = await dbGetRun(runId);
  expect(sot?.status).toBe("awaiting_approval");
  const cached = memoryGetRun(runId);
  expect(cached).not.toBeNull();
  memoryRestoreRun({
    ...cached!,
    status: staleStatus,
  });
  expect(memoryGetRun(runId)?.status).toBe(staleStatus);
  expect((await dbGetRun(runId))?.status).toBe("awaiting_approval");
}

describe("Approval waiting_approval → SoT approve path", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetAutomationV2DbStoreForTests();
    resetAutomationRunsV2DurableForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    enableFlags();
  });

  it("Case A: high-risk external → waiting approval → approve → runnable → external step runs", async () => {
    const executed: string[] = [];
    const auto = await createHighRiskAutomation("user_a", [
      highRiskGmailStep(),
    ]);
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_a",
      automationId: auto.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });
    expect(run.status).toBe("awaiting_approval");
    expect(run.preparation?.approvalReason ?? run.statusHistory.at(-1)?.reason).toBe(
      "system_high_risk_override",
    );
    expect(executed).toEqual([]);

    // Stale memory that previously caused automation_invalid_transition.
    await poisonMemoryStatus(run.id, "preparing");

    const approved = await automationPlatformService.approveRun(
      "user_a",
      run.id,
      ownerContext,
      { dispatch: false },
    );
    expect(approved.status).toBe("queued");
    expect(approved.approval?.status).toBe("approved");

    await dispatchAutomationRuns({
      runIds: [approved.id],
      invoker: trackingInvoker(executed),
    });
    const final = await automationPlatformService.getRun(
      "user_a",
      run.id,
      ownerContext,
    );
    expect(executed).toContain("gmail");
    expect(final.status).toBe("succeeded");
    expect(final.approval?.status).toBe("approved");
  });

  it("Case B: before approval, external step does not run", async () => {
    const executed: string[] = [];
    const auto = await createHighRiskAutomation("user_b", [
      highRiskGmailStep(),
    ]);
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_b",
      automationId: auto.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });
    expect(run.status).toBe("awaiting_approval");

    await dispatchAutomationRuns({
      runIds: [run.id],
      invoker: trackingInvoker(executed),
    });
    expect(executed).toEqual([]);
    const still = await dbGetRun(run.id);
    expect(still?.status).toBe("awaiting_approval");
  });

  it("Case C: reject → external step does not run", async () => {
    const executed: string[] = [];
    const auto = await createHighRiskAutomation("user_c", [
      highRiskGmailStep(),
    ]);
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_c",
      automationId: auto.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });
    const rejected = await automationPlatformService.rejectRun(
      "user_c",
      run.id,
      ownerContext,
    );
    expect(rejected.status).toBe("cancelled");
    expect(rejected.approval?.status).toBe("rejected");

    await dispatchAutomationRuns({
      runIds: [run.id],
      invoker: trackingInvoker(executed),
    });
    expect(executed).toEqual([]);
    expect((await dbGetRun(run.id))?.status).toBe("cancelled");
  });

  it("Case D: double approve does not double-execute", async () => {
    const executed: string[] = [];
    const auto = await createHighRiskAutomation("user_d", [
      highRiskGmailStep(),
    ]);
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_d",
      automationId: auto.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });

    const first = await automationPlatformService.approveRun(
      "user_d",
      run.id,
      ownerContext,
      { dispatch: false },
    );
    expect(first.status).toBe("queued");

    await expect(
      automationPlatformService.approveRun("user_d", run.id, ownerContext, {
        dispatch: false,
      }),
    ).rejects.toMatchObject({ code: "automation_invalid_transition" });

    await dispatchAutomationRuns({
      runIds: [run.id],
      invoker: trackingInvoker(executed),
    });
    // Second dispatch claim must be single-winner / no-op after terminal.
    await dispatchAutomationRuns({
      runIds: [run.id],
      invoker: trackingInvoker(executed),
    });
    expect(executed.filter((t) => t === "gmail")).toHaveLength(1);
  });

  it("Case E: Google Calendar automation → approve → google_calendar step reached", async () => {
    const executed: string[] = [];
    const auto = await createHighRiskAutomation(
      "user_e",
      [googleCalendarStep()],
      "calendar",
    );
    expect(
      auto.workflow.steps.some(
        (step) => step.enabled && step.type === "google_calendar",
      ),
    ).toBe(true);

    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_e",
      automationId: auto.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });
    expect(run.status).toBe("awaiting_approval");
    expect(run.steps.some((step) => step.capabilityId === "google_calendar")).toBe(
      true,
    );

    // Reproduce Production: UI shows awaiting_approval (DB) while approve
    // instance memory still has preparing → previously rejected.
    await poisonMemoryStatus(run.id, "queued");

    const approved = await automationPlatformService.approveRun(
      "user_e",
      run.id,
      ownerContext,
      { dispatch: false },
    );
    expect(approved.status).toBe("queued");

    await dispatchAutomationRuns({
      runIds: [approved.id],
      invoker: trackingInvoker(executed),
    });
    expect(executed).toContain("google_calendar");
    const final = await automationPlatformService.getRun(
      "user_e",
      run.id,
      ownerContext,
    );
    expect(
      final.steps.find((step) => step.capabilityId === "google_calendar")
        ?.status,
    ).toBe("succeeded");
  });

  it("getRun serves DB SoT when memory is empty (P1-03 parity with get())", async () => {
    const auto = await createHighRiskAutomation("user_sot", [
      highRiskGmailStep(),
    ]);
    const { run } = await automationPlatformService.enqueueRun({
      userId: "user_sot",
      automationId: auto.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });
    resetAutomationPlatformStoreForTests();
    expect(memoryGetRun(run.id)).toBeNull();
    const got = await automationPlatformService.getRun(
      "user_sot",
      run.id,
      ownerContext,
    );
    expect(got.id).toBe(run.id);
    expect(got.status).toBe("awaiting_approval");
  });
});
