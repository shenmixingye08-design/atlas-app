/**
 * P3: regular-user A/B isolation — IDOR, cache, memory, credentials, billing.
 * Owner bypass is not used as proof of safety.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

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
    Boolean(email?.startsWith("owner@") && email?.endsWith("@atlas.test")),
}));

const { orchestrateMock } = vi.hoisted(() => ({
  orchestrateMock: vi.fn(async () => ({
    assignment: "定期レポート",
    status: "completed",
    workflow: { status: "completed" },
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: {
      type: "generic",
      title: "t",
      summary: "s",
      sections: [],
      body: "ok",
    },
    reviewComments: "",
    approved: true,
    finalResponse: "USER_A_SECRET_ORCHESTRATION",
    totalDurationMs: 12,
    error: null,
  })),
}));

vi.mock("@/lib/orchestration/orchestrator", () => ({
  orchestrate: orchestrateMock,
}));

vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-${automation.id}`,
    registered: true,
  })),
}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyAutomationAwaitingReview: vi.fn(),
  notifyAutomationCompleted: vi.fn(),
  notifyAutomationFailed: vi.fn(),
  notifyOwnerSystemIncident: vi.fn(),
  notifyWorkCompleted: vi.fn(),
}));

import { applySubscriptionFromStripe } from "@/lib/billing/subscriptions/service";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { getUserBillingSummary } from "@/lib/billing/service";
import {
  buildRequestCacheKey,
  clearRequestCache,
  getCachedOrchestrationResult,
  setCachedOrchestrationResult,
} from "@/lib/cost-optimization/request-cache";
import {
  loadDurableDeliverable,
  persistDurableDeliverable,
  resetDurableDeliverableStoreForTests,
} from "@/lib/deliverables/durable-store";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFile,
} from "@/lib/deliverables/store";
import {
  deleteExternalServiceCredentials,
  getExternalServiceCredentials,
  resetExternalServiceCredentialStore,
  saveExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import { getXAccountAccessTokenResult } from "@/lib/integrations/x/token-manager";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import { MemoryProvider } from "@/lib/memory-apply/provider";
import { createUserMemory } from "@/lib/user-memory/service";
import { resetStoredMemories } from "@/lib/user-memory/store";
import { automationService } from "@/lib/automations/automation-service";
import { resetAutomationStore } from "@/lib/automations/repositories/server-automation-repository";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { resetAutomationPlatformStoreForTests } from "@/lib/automation-platform/repository/memory-store";
import { resetAutomationV2DbStoreForTests } from "@/lib/automation-platform/repository/db-store";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import { getWorkJob, touchWorkJob } from "@/lib/work-jobs/store";
import {
  createUserNotification,
  getUserNotificationById,
  listUserNotifications,
  removeUserNotification,
} from "@/lib/notifications/service";
import { resetNotificationStore } from "@/lib/notifications/store";
import { resetDurableInboxForTests } from "@/lib/notifications/durable-inbox";
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import { resetExternalServiceStore } from "@/lib/integrations/external-services/store";
import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";
import type { OrchestrationResult } from "@/lib/orchestration/types";

const USER_A = "user_p3_a";
const USER_B = "user_p3_b";

function cachedResult(text: string): OrchestrationResult {
  return {
    assignment: "同じ依頼",
    status: "completed",
    workflow: { status: "completed" },
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: {
      type: "generic",
      title: "t",
      summary: "s",
      sections: [],
      body: text,
    },
    reviewComments: "",
    approved: true,
    finalResponse: text,
    totalDurationMs: 1,
    error: null,
  } as unknown as OrchestrationResult;
}

function dailyV1Input(name: string) {
  return {
    name,
    description: "p3",
    schedule: {
      kind: "schedule" as const,
      preset: { type: "daily" as const, hour: 9, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 9:00",
    },
    workflow: { assignment: "定期レポート" },
    enabled: true,
    executionMode: "eco" as const,
  };
}

function v2Workflow(): CreateAutomationV2Input["workflow"] {
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

describe("P3 user isolation", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    authMock.mockReset();
    orchestrateMock.mockClear();
    clearRequestCache();
    resetSubscriptionStore();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetExternalServiceCredentialStore();
    resetExternalServiceStore();
    resetExternalAuthHydration();
    resetAutomationStore({ seed: false });
    resetAutomationPlatformStoreForTests();
    resetAutomationV2DbStoreForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    resetNotificationStore();
    resetDurableInboxForTests();
    resetStoredMemories(USER_A);
    resetStoredMemories(USER_B);
    vi.stubEnv("ATLAS_AUTOMATION_STORAGE", "memory_durable");
    vi.stubEnv("ATLAS_NOTIFICATION_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    setFeatureFlagState("automation_v2_enabled", "on");
    setFeatureFlagState("automation_memory_enabled", "on");
    setFeatureFlagState("automation_approval_enabled", "on");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("request cache keys include userId and do not collide", () => {
    const keyA = buildRequestCacheKey("同じ依頼", "eco", USER_A);
    const keyB = buildRequestCacheKey("同じ依頼", "eco", USER_B);
    expect(keyA).not.toBe(keyB);
    expect(() => buildRequestCacheKey("同じ依頼", "eco", "  ")).toThrow(
      /userId/,
    );

    setCachedOrchestrationResult(keyA, cachedResult("A_ONLY"), "eco");
    expect(getCachedOrchestrationResult(keyB)).toBeNull();
    expect(getCachedOrchestrationResult(keyA)?.finalResponse).toBe("A_ONLY");
  });

  it("same user still reuses eco request cache (no eco-mode regression)", () => {
    const key1 = buildRequestCacheKey("同じ依頼", "eco", USER_A);
    const key2 = buildRequestCacheKey("同じ依頼", "eco", USER_A);
    expect(key1).toBe(key2);
  });

  it("User B cannot list/get/update/delete/run User A V1 automation", async () => {
    const created = await automationService.createForUser(
      USER_A,
      dailyV1Input("Aの習慣"),
    );

    expect(await automationService.listForUser(USER_B)).toHaveLength(0);
    expect(await automationService.getByIdForUser(created.id, USER_B)).toBeNull();
    expect(
      await automationService.updateForUser(created.id, USER_B, {
        name: "奪取",
      }),
    ).toBeNull();
    expect(await automationService.deleteForUser(created.id, USER_B)).toBe(false);

    orchestrateMock.mockClear();
    const ran = await automationService.runNow(created.id, { userId: USER_B });
    expect(ran).toBeNull();
    expect(orchestrateMock).not.toHaveBeenCalled();

    const still = await automationService.getByIdForUser(created.id, USER_A);
    expect(still?.name).toBe("Aの習慣");
  });

  it("User B HTTP cannot GET/PATCH/DELETE/run User A V1 automation", async () => {
    const created = await automationService.createForUser(
      USER_A,
      dailyV1Input("A HTTP"),
    );
    authMock.mockResolvedValue({ userId: USER_B });

    const { GET, PATCH, DELETE } = await import(
      "@/app/api/automations/[id]/route"
    );
    const ctx = { params: Promise.resolve({ id: created.id }) };

    const getRes = await GET(new Request("http://localhost/api/automations/x"), ctx);
    expect(getRes.status).toBe(404);
    expect(await getRes.text()).not.toContain("A HTTP");

    const patchRes = await PATCH(
      new Request("http://localhost/api/automations/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      ctx,
    );
    expect(patchRes.status).toBe(404);

    const { POST: runPost } = await import(
      "@/app/api/automations/[id]/run/route"
    );
    orchestrateMock.mockClear();
    const runRes = await runPost(
      new Request("http://localhost/api/automations/x/run", { method: "POST" }),
      ctx,
    );
    expect(runRes.status).toBe(404);
    expect(orchestrateMock).not.toHaveBeenCalled();

    const delRes = await DELETE(
      new Request("http://localhost/api/automations/x", { method: "DELETE" }),
      ctx,
    );
    expect(delRes.status).toBe(404);
    expect(await automationService.getByIdForUser(created.id, USER_A)).not.toBeNull();
  });

  it("User B cannot enqueue or inspect User A V2 automation / run", async () => {
    const context = buildFeatureAccessContext(`${USER_A}@example.com`);
    const created = await automationPlatformService.create(
      USER_A,
      {
        name: "A V2",
        description: "秘密",
        status: "active",
        trigger: {
          type: "schedule",
          timezone: "Asia/Tokyo",
          schedule: { frequency: "daily", hour: 9, minute: 0 },
          event: null,
          condition: null,
        },
        workflow: v2Workflow(),
        executionPolicy: { mode: "run_then_notify" },
        instruction: {
          structuredOptions: { generatePdf: true },
          freeformNotes: "Aだけ",
        },
        rejectOnConflict: false,
      },
      context,
    );

    const bContext = buildFeatureAccessContext(`${USER_B}@example.com`);
    await expect(
      automationPlatformService.enqueueRun({
        userId: USER_B,
        automationId: created.id,
        triggerType: "manual",
        context: bContext,
        dispatch: false,
      }),
    ).rejects.toMatchObject({
      code: "automation_not_found",
      httpStatus: 404,
    } satisfies Partial<AutomationPlatformError>);

    await expect(
      automationPlatformService.listRuns(USER_B, created.id, bContext),
    ).rejects.toMatchObject({ code: "automation_not_found" });

    const listed = await automationPlatformService.listAllRuns(USER_B, bContext);
    expect(listed).toHaveLength(0);
  });

  it("User B cannot read User A deliverable by id (memory + durable)", async () => {
    const stored = saveDeliverableFile(
      {
        format: "docx",
        fileName: "secret.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from("PK\u0003\u0004secret-bytes"),
        isPlaceholder: false,
      },
      USER_A,
      { sourceContent: "# A secret", baseFileName: "secret" },
    );

    expect(await getStoredDeliverableForUser(stored.id, USER_B)).toBeNull();

    await persistDurableDeliverable({
      id: stored.id,
      userId: USER_A,
      fileName: stored.fileName,
      format: stored.format,
      mimeType: stored.mimeType,
      isPlaceholder: false,
      sourceContent: "# A secret",
      baseFileName: "secret",
      sizeBytes: stored.buffer.byteLength,
      contentBase64: null,
      contentSha256: stored.contentSha256 ?? null,
      storageBucket: null,
      storagePath: `${USER_A}/${stored.id}/secret.docx`,
      storageStatus: "stored",
      storageError: null,
      hasPkHeader: true,
      ooxmlVerified: true,
      downloadCount: 0,
      lastDownloadedAt: null,
      deletionReason: null,
      deletedAt: null,
      metadata: null,
      generatedAt: stored.generatedAt,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(await loadDurableDeliverable(stored.id, USER_B)).toBeNull();
    expect(await loadDurableDeliverable(stored.id, USER_A)).not.toBeNull();

    authMock.mockResolvedValue({ userId: USER_B });
    const { GET } = await import("@/app/api/deliverables/[id]/route");
    const res = await GET(new Request("http://localhost/api/deliverables/x"), {
      params: Promise.resolve({ id: stored.id }),
    });
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("secret-bytes");
    expect(body).not.toContain("A secret");
  });

  it("User B cannot poll User A work job", async () => {
    const now = new Date().toISOString();
    const job = touchWorkJob({
      id: "job_p3_a",
      userId: USER_A,
      assignment: "Aの秘密の依頼",
      idempotencyKey: "work:user_p3_a:1",
      metadata: {},
      status: "completed",
      attemptCount: 1,
      maxAttempts: 3,
      error: null,
      visionGate: null,
      result: cachedResult("A_JOB_SECRET"),
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    expect(getWorkJob(job.id, USER_B)).toBeNull();
    expect(getWorkJob(job.id, USER_A)?.assignment).toBe("Aの秘密の依頼");

    authMock.mockResolvedValue({ userId: USER_B });
    const { GET } = await import("@/app/api/work/jobs/[id]/route");
    const res = await GET(new Request("http://localhost/api/work/jobs/x"), {
      params: Promise.resolve({ id: job.id }),
    });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("A_JOB_SECRET");
  });

  it("User A memory is not injected into User B AI prompt", async () => {
    createUserMemory(USER_A, {
      category: "writing",
      title: "文体",
      content: "P3_A_ONLY_WRITING_STYLE",
    });
    createUserMemory(USER_B, {
      category: "writing",
      title: "文体",
      content: "P3_B_STYLE",
    });

    const forB = await MemoryProvider({
      userId: USER_B,
      channel: "commander",
      assignment: "営業資料を書いて",
    });
    expect(forB.combinedInjectionText).not.toContain("P3_A_ONLY_WRITING_STYLE");
    expect(JSON.stringify(forB)).not.toContain("P3_A_ONLY_WRITING_STYLE");

    const forA = await MemoryProvider({
      userId: USER_A,
      channel: "commander",
      assignment: "営業資料を書いて",
    });
    expect(forA.combinedInjectionText).toContain("P3_A_ONLY_WRITING_STYLE");
  });

  it("User B cannot read or refresh User A credentials", async () => {
    saveExternalServiceCredentials({
      userId: USER_A,
      serviceId: "x",
      accessToken: "access_a_secret",
      refreshToken: "refresh_a_secret",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "tweet.write",
      updatedAt: new Date().toISOString(),
    });
    saveExternalServiceCredentials({
      userId: USER_A,
      serviceId: "google",
      accessToken: "google_a_secret",
      refreshToken: "google_a_refresh",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "email",
      updatedAt: new Date().toISOString(),
    });

    expect(getExternalServiceCredentials(USER_B, "x")).toBeNull();
    expect(getExternalServiceCredentials(USER_B, "google")).toBeNull();
    expect(await getXAccountAccessTokenResult(USER_B)).toEqual({
      status: "missing",
    });
    expect(await getGoogleAccountAccessTokenResult(USER_B)).toEqual({
      status: "missing",
    });

    deleteExternalServiceCredentials(USER_B, "x");
    expect(getExternalServiceCredentials(USER_A, "x")?.accessToken).toBe(
      "access_a_secret",
    );
  });

  it("User B cannot list/get/delete User A notifications", async () => {
    const created = await createUserNotification({
      audience: "user",
      userId: USER_A,
      type: "completed",
      title: "A完了",
      message: "A_NOTIFICATION_SECRET",
    });
    expect(created).not.toBeNull();

    const listed = await listUserNotifications(USER_B);
    expect(listed).toHaveLength(0);
    expect(JSON.stringify(listed)).not.toContain("A_NOTIFICATION_SECRET");

    expect(
      await getUserNotificationById(created!.notificationId, USER_B),
    ).toBeNull();
    expect(await removeUserNotification(created!.notificationId, USER_B)).toBe(
      false,
    );
    expect(
      await getUserNotificationById(created!.notificationId, USER_A),
    ).not.toBeNull();
  });

  it("User B billing summary does not expose User A subscription", async () => {
    await applySubscriptionFromStripe({
      userId: USER_A,
      stripeCustomerId: "cus_p3_a",
      stripeSubscriptionId: "sub_p3_a",
      planId: "premium",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const summaryB = await getUserBillingSummary(USER_B);
    expect(summaryB.subscription.planId).not.toBe("premium");
    expect(JSON.stringify(summaryB)).not.toContain("cus_p3_a");
    expect(JSON.stringify(summaryB)).not.toContain("sub_p3_a");

    const summaryA = await getUserBillingSummary(USER_A);
    expect(summaryA.subscription.planId).toBe("premium");
  });

  it("client userId override on company API is rejected", async () => {
    authMock.mockResolvedValue({ userId: USER_A });
    const { POST } = await import("@/app/api/company/route");
    const res = await POST(
      new Request("http://localhost/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER_B, templateId: "generic" }),
      }),
    );
    expect([400, 403]).toContain(res.status);
  });
});
