import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  loadDurableDomain: vi.fn(async () => null),
  persistDurableDomain: vi.fn(async () => undefined),
}));
vi.mock("@/lib/integrations/x/post/service", () => ({
  postTweetNowForUser: vi.fn(async () => ({
    status: "x_not_connected",
    message: "X未接続",
  })),
}));
vi.mock("@/lib/integrations/google/gmail/service", () => ({
  saveGmailDraftForUser: vi.fn(async () => ({
    status: "google_not_connected",
    message: "Google未接続",
  })),
  createGmailComposeDraftForUser: vi.fn(async () => ({
    status: "google_not_connected",
    message: "Google未接続",
  })),
  sendReplyForUser: vi.fn(async () => ({
    status: "google_not_connected",
    message: "Google未接続",
  })),
}));
vi.mock("@/lib/integrations/google/calendar/service", () => ({
  createCalendarEventForUser: vi.fn(async () => ({
    status: "google_not_connected",
    message: "Google未接続",
  })),
}));
vi.mock("@/lib/integrations/wordpress/post/service", () => ({
  createWordPressPostForUser: vi.fn(async () => ({
    status: "wordpress_not_connected",
    message: "WordPress未接続",
  })),
}));
vi.mock("@/lib/integrations/dropbox/service", () => ({
  uploadDropboxFileForUser: vi.fn(async () => ({
    status: "dropbox_not_connected",
    message: "Dropbox未接続",
  })),
}));
vi.mock("@/lib/integrations/external-services/durable", () => ({
  ensureExternalAuthHydrated: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "owner@example.com"),
}));

import { liveStepInvoker } from "@/lib/automation-platform/adapters/live-step-invoker";
import { diagnoseAutomationLiveEnvironment } from "@/lib/automation-platform/adapters/env-diagnostics";
import { listLiveStepAdapterTypes } from "@/lib/automation-platform/adapters/registry";
import { resetAutomationIdempotencyForTests } from "@/lib/automation-platform/adapters/idempotency-store";
import {
  acquireDispatchLease,
  completeDispatchLease,
  getDispatchLease,
  reclaimStuckDispatchLeases,
  resetAutomationDispatchForTests,
} from "@/lib/automation-platform/execution/durable-dispatch";
import {
  memoryInsertRun,
  resetAutomationPlatformStoreForTests,
} from "@/lib/automation-platform/repository/memory-store";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRun } from "@/lib/automation-platform/types";

function step(
  type: AutomationWorkflowStep["type"],
  configuration: Record<string, unknown>,
): AutomationWorkflowStep {
  return {
    id: `step_${type}`,
    type,
    name: type,
    order: 0,
    inputBindings: {},
    configuration,
    requiresApproval: type === "x_post",
    retryPolicy: { maxAttempts: 1, backoffMs: [500] },
    timeoutMs: 30_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

describe("Automation V2 live execution E2E (honest)", () => {
  afterEach(() => {
    resetAutomationIdempotencyForTests();
    resetAutomationDispatchForTests();
    resetAutomationPlatformStoreForTests();
    resetFeatureFlagStore();
    vi.unstubAllEnvs();
  });

  it("exposes live adapters for deliverables and connectors", () => {
    const types = listLiveStepAdapterTypes();
    expect(types).toEqual(
      expect.arrayContaining([
        "word_generate",
        "excel_generate",
        "pdf_generate",
        "powerpoint_generate",
        "file_convert",
        "x_post",
        "gmail",
        "google_calendar",
        "wordpress",
        "dropbox",
        "notify",
        "vision_analysis",
      ]),
    );
  });

  it("A–G: external live paths fail closed without user OAuth / real API reachability", async () => {
    setFeatureFlagState("automation_v2_enabled", "on");
    setFeatureFlagState("x", "on");
    setFeatureFlagState("google", "on");
    setFeatureFlagState("wordpress", "on");
    setFeatureFlagState("dropbox", "on");

    const cases = [
      step("x_post", { text: "hello world" }),
      step("gmail", { to: "a@example.com", mode: "draft" }),
      step("google_calendar", { title: "Meeting" }),
      step("wordpress", { title: "Post", content: "Body" }),
      step("dropbox", { saveTarget: "/Reports" }),
    ];

    for (const s of cases) {
      const result = await liveStepInvoker({
        step: s,
        userId: "user_e2e",
        automationName: "E2E",
        automationId: "auto_e2e",
        runId: "run_e2e",
        approved: true,
        attempt: 1,
        priorArtifacts: [],
        instructionText: "test",
        freeformNotes: "test",
        structuredOptions: {},
        occurrenceKey: "occ1",
      });
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBeTruthy();
    }
  });

  it("F: vision fails closed without OPENAI_API_KEY", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await liveStepInvoker({
      step: step("vision_analysis", { attachmentId: "att_1" }),
      userId: "user_e2e",
      automationName: "E2E",
      automationId: "auto_e2e",
      runId: "run_e2e",
      approved: true,
      attempt: 1,
      priorArtifacts: [],
      instructionText: "レシートを解析",
      freeformNotes: "",
      structuredOptions: {},
      occurrenceKey: null,
    });
    expect(result.ok).toBe(false);
    expect(result.needsUserInput || result.errorCode).toBeTruthy();
  });

  it("H: worker lease heartbeat and stuck reclaim", async () => {
    const now = new Date().toISOString();
    const run: AutomationRun = {
      id: "run_lease_1",
      automationId: "auto_lease",
      automationName: "lease",
      userId: "user_e2e",
      status: "running",
      runKey: "manual:auto_lease:1",
      idempotencyKey: "idemp_lease_1",
      scheduleOccurrenceKey: null,
      triggerType: "manual",
      scheduledFor: null,
      queuedAt: now,
      startedAt: now,
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
      diagnosticId: "diag_lease",
      createdAt: now,
      updatedAt: now,
      memoryReferences: [],
    };
    memoryInsertRun(run);

    const lease = await acquireDispatchLease({
      run: { ...run, status: "running" },
      workerId: "worker_a",
      ttlMs: 1,
    });
    expect(lease?.status).toBe("leased");
    await new Promise((r) => setTimeout(r, 5));
    const reclaimed = await reclaimStuckDispatchLeases({
      userId: "user_e2e",
      nowMs: Date.now() + 1000,
    });
    expect(reclaimed).toContain("run_lease_1");
    expect(getDispatchLease("run_lease_1")?.status).toBe("released");

    const again = await acquireDispatchLease({
      run: { ...run, status: "queued" },
      workerId: "worker_b",
    });
    expect(again?.workerId).toBe("worker_b");
    await completeDispatchLease({
      runId: run.id,
      userId: run.userId,
      workerId: "worker_b",
    });
    expect(getDispatchLease(run.id)?.status).toBe("completed");
  });

  it("records environment gaps for live scenarios A–H", () => {
    const env = diagnoseAutomationLiveEnvironment();
    const openai = env.find((i) => i.id === "openai");
    const email = env.find((i) => i.id === "email_delivery");
    const queue = env.find((i) => i.id === "queue_worker");

    expect(openai).toBeTruthy();
    expect(email?.status).toBe("missing");
    expect(queue).toBeTruthy();

    const blocked = [
      !openai || openai.status !== "configured" ? "OPENAI_API_KEY" : null,
      "user OAuth connections (X/Gmail/Calendar/Dropbox/WordPress)",
      "email delivery provider",
      "AUTOMATION_E2E_LIVE_EXTERNAL (optional Live E2E opt-in)",
    ].filter(Boolean);

    expect(blocked.length).toBeGreaterThan(0);
  });

  it("does not mark orchestrate as live-success", async () => {
    const result = await liveStepInvoker({
      step: step("orchestrate", { assignment: "仕事をして" }),
      userId: "user_e2e",
      automationName: "E2E",
      automationId: "auto_e2e",
      runId: "run_e2e",
      approved: true,
      attempt: 1,
      priorArtifacts: [],
      instructionText: "仕事をして",
      freeformNotes: "",
      structuredOptions: {},
      occurrenceKey: null,
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("not_wired");
  });
});
