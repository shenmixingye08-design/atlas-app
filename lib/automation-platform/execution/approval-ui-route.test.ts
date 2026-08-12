/**
 * Production UI「承認して実行」経路の契約 + Cases A–E。
 *
 * UI → client → POST /api/.../approve → approveRun → getAutomationRunFromSot
 * が切れていないこと、および高リスク承認フローを固定する。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

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

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("@/lib/feature-flags/resolve-context", () => ({
  resolveFeatureAccessContext: vi.fn(async () => ({
    email: "owner@example.com",
    isOwner: true,
    isBetaUser: true,
  })),
}));

import { POST as approvePost } from "@/app/api/automation-platform/runs/[runId]/approve/route";
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

function calendarStep(): CreateAutomationV2Input["workflow"]["steps"][number] {
  return {
    id: "cal1",
    type: "google_calendar",
    name: "Googleカレンダー",
    order: 1,
    inputBindings: {},
    configuration: { title: "MINERVOT自動化テスト", action: "create_event" },
    requiresApproval: false,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

function gmailStep(): CreateAutomationV2Input["workflow"]["steps"][number] {
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

async function createAuto(
  userId: string,
  steps: CreateAutomationV2Input["workflow"]["steps"],
) {
  return automationPlatformService.create(
    userId,
    {
      name: "ui-route",
      status: "active",
      trigger: {
        type: "manual",
        timezone: "Asia/Tokyo",
        schedule: null,
        event: null,
        condition: null,
      },
      workflow: workflow(steps),
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
    const external =
      input.step.type === "gmail" ||
      input.step.type === "google_calendar" ||
      input.step.type === "x_post";
    const id = `art_${input.step.type}_${executed.length}`;
    const extId = `ext_${input.step.type}_${executed.length}`;
    return {
      ok: true,
      summary: `${input.step.type} ok`,
      artifacts: [
        {
          id,
          kind: external ? ("external" as const) : ("deliverable" as const),
          label: input.step.type,
          externalId: external ? extId : null,
          url: external ? null : "https://example.com/file",
          createdAt: new Date().toISOString(),
        },
      ],
      evidence: {
        artifactIds: [id],
        storageObjectIds: external ? [] : [id],
        externalActionIds: external ? [extId] : [],
        notificationIds: [],
      },
    };
  };
}

describe("Production UI approve route wiring", () => {
  it("source: 承認して実行 → client → approve route → approveRun → SoT getRun", async () => {
    const panel = await readFile(
      "components/automations/v2/run-review-panel.tsx",
      "utf8",
    );
    const client = await readFile("lib/automation-platform/client.ts", "utf8");
    const route = await readFile(
      "app/api/automation-platform/runs/[runId]/approve/route.ts",
      "utf8",
    );
    const service = await readFile(
      "lib/automation-platform/service/automation-service.ts",
      "utf8",
    );

    expect(panel).toContain("承認して実行");
    expect(panel).toContain("approveAutomationRun");
    expect(client).toContain(
      "`/api/automation-platform/runs/${runId}/approve`",
    );
    expect(route).toContain("automationPlatformService.approveRun");

    const getRunStart = service.indexOf("async getRun(");
    const getRunEnd = service.indexOf("async getRunByDiagnosticId(");
    expect(getRunStart).toBeGreaterThanOrEqual(0);
    expect(getRunEnd).toBeGreaterThan(getRunStart);
    const getRunBody = service.slice(getRunStart, getRunEnd);
    expect(getRunBody).toContain("getAutomationRunFromSot");
    expect(getRunBody).not.toContain("memoryGetRun");

    const approveStart = service.indexOf("async approveRun(");
    const approveEnd = service.indexOf("async rejectRun(");
    const approveBody = service.slice(approveStart, approveEnd);
    expect(approveBody).toContain("this.getRun(");
    expect(approveBody).toContain('to: "queued"');
  });
});

describe("Production UI approve API path Cases A–E", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetAutomationV2DbStoreForTests();
    resetAutomationRunsV2DurableForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    enableFlags();
    authMock.mockReset();
  });

  async function enqueueAwaiting(userId: string, steps = [gmailStep()]) {
    const auto = await createAuto(userId, steps);
    const { run } = await automationPlatformService.enqueueRun({
      userId,
      automationId: auto.id,
      triggerType: "manual",
      context: ownerContext,
      dispatch: false,
    });
    expect(run.status).toBe("awaiting_approval");
    return run;
  }

  async function approveViaUiRoute(userId: string, runId: string) {
    authMock.mockResolvedValue({ userId });
    const response = await approvePost(new Request("http://local/approve"), {
      params: Promise.resolve({ runId }),
    });
    const body = (await response.json()) as {
      run?: { status: string; approval?: { status: string } };
      error?: { code: string; message: string };
    };
    return { response, body };
  }

  it("Case A: awaiting_approval → UI approve route → queued", async () => {
    const run = await enqueueAwaiting("user_ui_a");

    // Stale memory must not block the Production UI approve route (#295).
    const cached = memoryGetRun(run.id)!;
    memoryRestoreRun({ ...cached, status: "preparing" });

    const dispatch = await import(
      "@/lib/automation-platform/execution/dispatch"
    );
    const spy = vi
      .spyOn(dispatch, "dispatchAutomationRuns")
      .mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        retrying: 0,
        awaiting: 0,
      });

    try {
      const { response, body } = await approveViaUiRoute("user_ui_a", run.id);
      expect(response.status).toBe(200);
      expect(body.run?.status).toBe("queued");
      expect(body.run?.approval?.status).toBe("approved");
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ runIds: [run.id] }),
      );
      const sot = await dbGetRun(run.id);
      expect(sot?.status).toBe("queued");
      expect(sot?.approval?.status).toBe("approved");
    } finally {
      spy.mockRestore();
    }
  });

  it("Case B: before approval, external step does not run", async () => {
    const executed: string[] = [];
    const run = await enqueueAwaiting("user_ui_b");
    await dispatchAutomationRuns({
      runIds: [run.id],
      invoker: trackingInvoker(executed),
    });
    expect(executed).toEqual([]);
    expect((await dbGetRun(run.id))?.status).toBe("awaiting_approval");
  });

  it("Case C: reject → not executed", async () => {
    const executed: string[] = [];
    const run = await enqueueAwaiting("user_ui_c");
    await automationPlatformService.rejectRun("user_ui_c", run.id, ownerContext);
    await dispatchAutomationRuns({
      runIds: [run.id],
      invoker: trackingInvoker(executed),
    });
    expect(executed).toEqual([]);
    expect((await dbGetRun(run.id))?.status).toBe("cancelled");
  });

  it("Case D: double approve via UI route → no double execution", async () => {
    const run = await enqueueAwaiting("user_ui_d");
    const dispatch = await import(
      "@/lib/automation-platform/execution/dispatch"
    );
    const spy = vi
      .spyOn(dispatch, "dispatchAutomationRuns")
      .mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        retrying: 0,
        awaiting: 0,
      });

    try {
      const first = await approveViaUiRoute("user_ui_d", run.id);
      expect(first.response.status).toBe(200);
      expect(first.body.run?.status).toBe("queued");
      expect(first.body.run?.approval?.status).toBe("approved");
      expect(spy).toHaveBeenCalledTimes(1);

      const second = await approveViaUiRoute("user_ui_d", run.id);
      expect(second.response.status).toBe(409);
      expect(second.body.error?.code).toBe("automation_invalid_transition");
      expect(second.body.error?.message).toBe(
        "この操作は現在の状態では行えません。",
      );
      // Second approve must not trigger another dispatch.
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }

    const final = await dbGetRun(run.id);
    expect(final?.status).toBe("queued");
    expect(final?.approval?.status).toBe("approved");
  });

  it("Case E: Google Calendar → UI approve → google_calendar step reached", async () => {
    const executed: string[] = [];
    const run = await enqueueAwaiting("user_ui_e", [calendarStep()]);
    expect(
      run.steps.some((step) => step.capabilityId === "google_calendar"),
    ).toBe(true);

    const cached = memoryGetRun(run.id)!;
    memoryRestoreRun({ ...cached, status: "queued" });

    const dispatch = await import(
      "@/lib/automation-platform/execution/dispatch"
    );
    const spy = vi
      .spyOn(dispatch, "dispatchAutomationRuns")
      .mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        retrying: 0,
        awaiting: 0,
      });

    try {
      const { response, body } = await approveViaUiRoute("user_ui_e", run.id);
      expect(response.status).toBe(200);
      expect(body.run?.status).toBe("queued");
      expect(body.run?.approval?.status).toBe("approved");
    } finally {
      spy.mockRestore();
    }

    await dispatchAutomationRuns({
      runIds: [run.id],
      invoker: trackingInvoker(executed),
    });
    expect(executed).toContain("google_calendar");
    const final = await dbGetRun(run.id);
    expect(
      final?.steps.find((step) => step.capabilityId === "google_calendar")
        ?.status,
    ).toBe("succeeded");
    expect(final?.approval?.status).toBe("approved");
  });
});
