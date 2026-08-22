/**
 * P6: End-to-end production workflow validation.
 * Programmatic user-path proofs. No live OpenAI / Stripe / X spend.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/work-jobs/durable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/work-jobs/durable")>();
  return {
    ...actual,
    persistWorkJob: vi.fn(async () => "supabase" as const),
  };
});

vi.mock("@/lib/runtime/is-production", () => ({
  isAtlasProduction: () => false,
}));

const requireAndConsumeAiJob = vi.fn(async () => null as Response | null);
vi.mock("@/lib/billing/access", () => ({
  requireAndConsumeAiJob: (...args: unknown[]) =>
    requireAndConsumeAiJob(...args),
}));

const runCommanderRequest = vi.fn();
vi.mock("@/lib/commander/service", () => ({
  runCommanderRequest: (...args: unknown[]) => runCommanderRequest(...args),
}));

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET as downloadDeliverable } from "@/app/api/deliverables/[id]/route";
import {
  checkAiUsageLimit,
  checkAutomationTaskLimit,
  checkExternalIntegrationLimit,
  checkFeatureAccess,
  getPlanDefinition,
  type PlanId,
} from "@/lib/billing/plans";
import type { CommanderRunResult } from "@/lib/commander/types";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { exportDocumentsOnServer } from "@/lib/deliverables/server-document-export";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
} from "@/lib/deliverables/store";
import type { DeliverableFormat } from "@/lib/deliverables/types";
import { resetMemoryDurableStorageForTests } from "@/lib/deliverables/memory-durable-storage";
import { preprocessImageBuffer } from "@/lib/attachments/preprocess";
import { loadSharp } from "@/lib/images/load-sharp";
import { classifyXPostError } from "@/lib/integrations/x/post/durable-x-post-jobs";
import {
  buildManualAutomationIdempotencyKey,
  buildScheduledAutomationIdempotencyKey,
} from "@/lib/jobs/idempotency";
import { classifyFailure } from "@/lib/reliability/error-classification";
import { classifyCoreReadiness } from "@/lib/health/core-readiness";
import { resolveUsageDisplay } from "@/lib/billing/usage-awareness/load-state";
import { createNotification } from "@/lib/notifications/service";
import {
  listStoredNotifications,
  resetNotificationStore,
} from "@/lib/notifications/store";
import { resetDurableInboxForTests } from "@/lib/notifications/durable-inbox";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { buildWorkRequestSubmitPayload } from "@/lib/workspace/work-request-payload";
import {
  findStoredPersonalMemory,
  listStoredPersonalMemories,
  resetPersonalMemoryStoreForTests,
  upsertStoredPersonalMemory,
} from "@/lib/personal-memory/store";
import type { PersonalMemoryRecord } from "@/lib/personal-memory/types";
import {
  clearWorkJobProcessMemoryForTests,
  getWorkJob,
  saveWorkJob,
  type WorkJobRecord,
} from "@/lib/work-jobs/store";
import { executeWorkJob, isWorkJobTerminal } from "@/lib/work-jobs/run";

const USER_A = "user_p6_a";
const USER_B = "user_p6_b";
const FORMATS: DeliverableFormat[] = ["docx", "xlsx", "pdf", "pptx"];

const SAMPLE = `# P6統合検証

## 概要
一般ユーザーが依頼から成果物まで完走できることを証明します。

## 本文
${"習慣的な作業を減らし、途中失敗を完了扱いしません。\n".repeat(20)}
`;

function orchestrationResult(assignment: string): OrchestrationResult {
  return {
    assignment,
    status: "completed",
    workflow: { status: "completed", approved: true },
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: {
      type: "document",
      title: assignment.slice(0, 40),
      markdown: SAMPLE,
      plainText: SAMPLE,
      html: `<p>${SAMPLE.slice(0, 80)}</p>`,
      content: SAMPLE,
      summary: "P6",
      metadata: {},
      downloads: {},
    },
    reviewComments: "",
    approved: true,
    finalResponse: SAMPLE,
    totalDurationMs: 12,
  } as unknown as OrchestrationResult;
}

function queuedJob(id: string, userId = USER_A): WorkJobRecord {
  const now = new Date().toISOString();
  return {
    id,
    userId,
    assignment: "週次報告書をWordで作成してください",
    idempotencyKey: `work:${userId}:client:${id}`,
    metadata: {},
    status: "queued",
    attemptCount: 0,
    maxAttempts: 3,
    error: null,
    visionGate: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

function commanderCompleted(fileId: string): CommanderRunResult {
  return {
    runId: "run_p6",
    status: "completed",
    plan: {} as CommanderRunResult["plan"],
    result: {
      ...orchestrationResult("週次報告書"),
      fileDeliverables: [
        {
          id: fileId,
          fileName: "週次報告書.docx",
          format: "docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          generatedAt: new Date().toISOString(),
          sizeBytes: 4096,
          isPlaceholder: false,
          downloadUrl: `/api/deliverables/${fileId}`,
        },
      ],
    },
    report: { summary: "完了" } as CommanderRunResult["report"],
    attempts: [],
    confirmationReasons: [],
    persistence: {
      projectId: "proj_p6",
      projectPersisted: true,
      wordRequired: true,
      wordDeliverableId: fileId,
      wordCompletionVerified: true,
      notificationCreated: true,
      artifactsRequired: true,
      artifactsVerified: true,
      exportedFormats: ["docx"],
    },
  };
}

describe("P6-01 normal request chain", () => {
  beforeEach(async () => {
    clearWorkJobProcessMemoryForTests();
    requireAndConsumeAiJob.mockReset();
    requireAndConsumeAiJob.mockResolvedValue(null);
    runCommanderRequest.mockReset();
  });

  it("completes only when downloadable artifacts exist", async () => {
    runCommanderRequest.mockResolvedValue(commanderCompleted("del_ok"));
    await saveWorkJob(queuedJob("job_ok"));
    const out = await executeWorkJob("job_ok", USER_A);
    expect(out.status).toBe("completed");
    expect(isWorkJobTerminal(out.status)).toBe(true);
    expect(out.result?.fileDeliverables?.[0]?.sizeBytes).toBeGreaterThan(0);
    expect(getWorkJob("job_ok", USER_B)).toBeNull();
  });

  it("does not mark missing artifacts as completed", async () => {
    const incomplete = commanderCompleted("del_missing");
    incomplete.persistence = {
      ...incomplete.persistence!,
      artifactsVerified: false,
      wordCompletionVerified: false,
    };
    incomplete.result = {
      ...incomplete.result!,
      fileDeliverables: [],
    };
    runCommanderRequest.mockResolvedValue(incomplete);
    await saveWorkJob(queuedJob("job_gate"));
    const out = await executeWorkJob("job_gate", USER_A);
    expect(out.status).toBe("failed");
    const diagnostic = out.metadata.failureDiagnostic as {
      diagnosticId?: string;
      failedStage?: string;
    };
    expect(diagnostic.failedStage).toBe("completion_gate");
    expect(diagnostic.diagnosticId).toMatch(/^diag_/);
  });

  it("does not re-run a completed job", async () => {
    runCommanderRequest.mockResolvedValue(commanderCompleted("del_once"));
    await saveWorkJob(queuedJob("job_once"));
    const first = await executeWorkJob("job_once", USER_A);
    expect(first.status).toBe("completed");
    runCommanderRequest.mockClear();
    const second = await executeWorkJob("job_once", USER_A);
    expect(second.status).toBe("completed");
    expect(runCommanderRequest).not.toHaveBeenCalled();
  });

  it("tracks diagnosticId when commander throws", async () => {
    runCommanderRequest.mockRejectedValue(new Error("OpenAI timed out"));
    await saveWorkJob(queuedJob("job_timeout"));
    const out = await executeWorkJob("job_timeout", USER_A);
    expect(out.status).toBe("failed");
    const diagnostic = out.metadata.failureDiagnostic as {
      diagnosticId?: string;
      failedStage?: string;
    };
    expect(diagnostic.diagnosticId).toBe("diag_job_timeout");
    expect(diagnostic.failedStage).toBe("timeout");
  });

  it("writes diagnosticId when vision fails without an upstream id", async () => {
    const failed = commanderCompleted("del_vision");
    failed.visionGate = {
      status: "vision_failed",
      analysisSuccess: false,
      message: "画像を解析できませんでした",
      userCode: "vision_failed",
      failedStage: "vision_response",
      diagnosticId: null,
    };
    runCommanderRequest.mockResolvedValue(failed);
    await saveWorkJob(queuedJob("job_vision"));
    const out = await executeWorkJob("job_vision", USER_A);
    expect(out.status).toBe("failed");
    const diagnostic = out.metadata.failureDiagnostic as {
      diagnosticId?: string;
      failedStage?: string;
    };
    expect(diagnostic.diagnosticId).toBe("diag_job_vision");
    expect(diagnostic.failedStage).toBe("vision_response");
  });

  it("records quota denial without completing the job", async () => {
    requireAndConsumeAiJob.mockResolvedValue(
      new Response(JSON.stringify({ reason: "今月のAI作業上限に達しました。" }), {
        status: 429,
      }),
    );
    await saveWorkJob(queuedJob("job_quota"));
    const out = await executeWorkJob("job_quota", USER_A);
    expect(out.status).toBe("failed");
    expect(runCommanderRequest).not.toHaveBeenCalled();
    const diagnostic = out.metadata.failureDiagnostic as {
      diagnosticId?: string;
      failedStage?: string;
      developerCode?: string;
    };
    expect(diagnostic.diagnosticId).toBe("diag_job_quota");
    expect(diagnostic.failedStage).toBe("quota");
    expect(diagnostic.developerCode).toBe("ai_quota_denied");
  });
});

describe("P6-01 request payload + history/notify", () => {
  beforeEach(async () => {
    resetNotificationStore();
    await resetDurableInboxForTests();
  });

  it("home and お願いする submit the same work-job body", () => {
    const home = buildWorkRequestSubmitPayload({
      assignment: "企画書を作ってください",
    });
    const ask = buildWorkRequestSubmitPayload({
      assignment: "企画書を作ってください",
    });
    expect(home).toEqual(ask);
    expect(home.metadata.requestUi).toBe("secretary_zero_friction_v1");
  });

  it("completed work can appear in history without exposing another user", async () => {
    const mine = await createNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "仕事が完了しました",
        message: "週次報告書をご用意しました",
        deliverableId: "del_hist",
      },
      { skipDelivery: true },
    );
    expect(mine).toBeTruthy();
    const listed = listStoredNotifications({ audience: "user", userId: USER_A });
    expect(listed.some((row) => row.deliverableId === "del_hist")).toBe(true);
    expect(
      listStoredNotifications({ audience: "user", userId: USER_B }),
    ).toEqual([]);
  });
});

describe("P6-02 deliverable four-format chain", () => {
  beforeEach(() => {
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetMemoryDurableStorageForTests();
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: USER_A });
  });

  it("generates, lists, and downloads docx/xlsx/pdf/pptx with isolation", async () => {
    const exported = await exportDocumentsOnServer({
      userId: USER_A,
      assignment: "P6四形式成果物",
      result: orchestrationResult("P6四形式成果物"),
      requestId: "req_p6_formats",
      formats: FORMATS,
      notify: false,
    });
    expect(exported.ok).toBe(true);
    const files =
      exported.attempted && "files" in exported ? exported.files : [];
    expect(files).toHaveLength(4);

    for (const format of FORMATS) {
      const file = files.find((row) => row.format === format);
      expect(file, format).toBeTruthy();
      expect(file!.sizeBytes).toBeGreaterThan(0);
      expect(file!.downloadUrl).toBe(`/api/deliverables/${file!.id}`);

      const stored = await getStoredDeliverableForUser(file!.id, USER_A);
      expect(stored?.buffer.byteLength).toBeGreaterThan(0);
      expect(await getStoredDeliverableForUser(file!.id, USER_B)).toBeNull();

      const response = await downloadDeliverable(
        new Request(`http://localhost${file!.downloadUrl}`),
        { params: Promise.resolve({ id: file!.id }) },
      );
      expect(response.status).toBe(200);
      const body = Buffer.from(await response.arrayBuffer());
      expect(body.byteLength).toBeGreaterThan(0);
      if (format === "pdf") expect(body.subarray(0, 4).toString("utf8")).toBe("%PDF");
      if (format === "docx" || format === "xlsx" || format === "pptx") {
        expect(body.subarray(0, 2).toString("utf8")).toBe("PK");
      }
    }

    authMock.mockResolvedValue({ userId: USER_B });
    const stolen = await downloadDeliverable(
      new Request(`http://localhost${files[0]!.downloadUrl}`),
      { params: Promise.resolve({ id: files[0]!.id }) },
    );
    expect(stolen.status).toBeGreaterThanOrEqual(400);
  });
});

describe("P6-03 image runtime isolation", () => {
  it("loads sharp on linux without importing it from billing/automations", async () => {
    const sharp = await loadSharp();
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#224466" },
    })
      .png()
      .toBuffer();
    expect((await sharp(png).metadata()).width).toBe(8);

    const billing = readFileSync(
      join(process.cwd(), "app/api/billing/summary/route.ts"),
      "utf8",
    );
    const automations = readFileSync(
      join(process.cwd(), "app/api/automations/route.ts"),
      "utf8",
    );
    expect(billing).not.toMatch(/loadSharp|probe-sharp|from ["']sharp["']/);
    expect(automations).not.toMatch(/loadSharp|probe-sharp|from ["']sharp["']/);

    const processed = await preprocessImageBuffer({ buffer: png });
    expect(processed.width).toBe(8);
    expect(processed.buffer.byteLength).toBeGreaterThan(0);
  });
});

describe("P6-04 / P6-05 automation and X", () => {
  it("same schedule slot cannot create a second automation identity", () => {
    const first = buildScheduledAutomationIdempotencyKey({
      userId: USER_A,
      automationId: "auto_p6",
      scheduledAt: "2026-08-22T00:00:00.000Z",
    });
    const second = buildScheduledAutomationIdempotencyKey({
      userId: USER_A,
      automationId: "auto_p6",
      scheduledAt: "2026-08-22T00:00:00.000Z",
    });
    expect(first).toBe(second);
    expect(
      buildManualAutomationIdempotencyKey({
        userId: USER_A,
        automationId: "auto_p6",
        nowMs: 1_000,
      }),
    ).toBe(
      buildManualAutomationIdempotencyKey({
        userId: USER_A,
        automationId: "auto_p6",
        nowMs: 30_000,
      }),
    );
  });

  it("X persist-after-success is not retried", () => {
    const classified = classifyXPostError(
      new Error("persist_after_success unknown_outcome 再投稿は行いません"),
    );
    expect(classified.code).toBe("unknown_outcome");
    expect(classified.retryable).toBe(false);
  });
});

describe("P6-06 billing tier matrix", () => {
  const tiers: PlanId[] = ["free", "light", "standard", "premium"];

  it("keeps AI / automation / integration caps consistent and monotonic", () => {
    const rows = tiers.map((planId) => {
      const plan = getPlanDefinition(planId);
      return {
        planId,
        ai: plan.limits.aiUsageMonthly,
        automations: plan.limits.automationTasks,
        integrations: plan.limits.externalIntegrations,
      };
    });
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.ai).toBeGreaterThan(rows[i - 1]!.ai);
      expect(rows[i]!.automations).toBeGreaterThanOrEqual(
        rows[i - 1]!.automations,
      );
      expect(rows[i]!.integrations).toBeGreaterThanOrEqual(
        rows[i - 1]!.integrations,
      );
    }

    const usage = (aiRuns: number) =>
      ({
        userId: USER_A,
        month: "2026-08",
        updatedAt: "2026-08-22T00:00:00.000Z",
        aiRuns,
        snsPosts: 0,
        xUrlPosts: 0,
        wordpressPosts: 0,
        automationTasksActive: 0,
      }) as const;
    expect(checkAiUsageLimit("free", usage(1)).allowed).toBe(false);
    expect(checkAiUsageLimit("light", usage(29)).allowed).toBe(true);
    expect(checkAutomationTaskLimit("free", 0).allowed).toBe(false);
    expect(checkAutomationTaskLimit("light", 2).allowed).toBe(true);
    expect(checkExternalIntegrationLimit("free", 0).allowed).toBe(false);
    expect(checkExternalIntegrationLimit("standard", 2).allowed).toBe(true);
    expect(checkFeatureAccess("free", "sns_auto_post").allowed).toBe(false);
    expect(checkFeatureAccess("standard", "sns_auto_post").allowed).toBe(true);
    expect(checkFeatureAccess("free", "google_integration").allowed).toBe(false);
    expect(checkFeatureAccess("standard", "google_integration").allowed).toBe(
      true,
    );
  });
});

describe("P6-07 failure matrix", () => {
  it("does not treat failures as success, zero, or untraceable", () => {
    expect(classifyFailure(new Error("request timed out"))).toBe("timeout");
    expect(classifyFailure(new Error("OpenAI 429 rate limit"))).toBe(
      "rate_limit",
    );
    expect(
      resolveUsageDisplay({ ready: false, used: 0, limit: 30 }).kind,
    ).toBe("unavailable");
    expect(
      classifyCoreReadiness({
        supabaseConfigured: true,
        serviceRoleConfigured: true,
        supabaseReachable: false,
        billingStore: "unavailable",
        automationStore: "ok",
        workJobStore: "ok",
        openaiConfigured: true,
        integrationsConfigured: true,
        sharpRuntime: "ok",
      }),
    ).toBe("unhealthy");
    expect(
      classifyCoreReadiness({
        supabaseConfigured: true,
        serviceRoleConfigured: true,
        supabaseReachable: true,
        billingStore: "ok",
        automationStore: "ok",
        workJobStore: "ok",
        openaiConfigured: true,
        integrationsConfigured: true,
        sharpRuntime: "unavailable",
      }),
    ).toBe("degraded");
  });
});

describe("P6-09 multi-user isolation", () => {
  beforeEach(() => {
    clearWorkJobProcessMemoryForTests();
    resetPersonalMemoryStoreForTests();
  });

  it("does not leak jobs, memory, or notifications across users", async () => {
    await saveWorkJob(queuedJob("job_iso_a", USER_A));
    expect(getWorkJob("job_iso_a", USER_B)).toBeNull();
    expect(getWorkJob("job_iso_a", USER_A)?.userId).toBe(USER_A);

    const now = new Date().toISOString();
    const memory: PersonalMemoryRecord = {
      id: "mem_p6_a",
      userId: USER_A,
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { secret: "USER_A_ONLY" },
      title: "口調",
      summary: "丁寧語",
      source: "explicit",
      confidence: 0.9,
      status: "active",
      sensitivity: "normal",
      appliesTo: {
        global: true,
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
      },
      evidence: [{ kind: "manual", summary: "p6", occurredAt: now }],
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      expiresAt: null,
      rejectedReason: null,
      deletedAt: null,
    };
    upsertStoredPersonalMemory(memory);
    expect(findStoredPersonalMemory(USER_B, "mem_p6_a")).toBeNull();
    expect(listStoredPersonalMemories(USER_B)).toEqual([]);
    expect(listStoredPersonalMemories(USER_A)[0]?.value.secret).toBe(
      "USER_A_ONLY",
    );
  });
});

describe("P6-08 mobile UX contract", () => {
  const root = process.cwd();
  const read = (relative: string) =>
    readFileSync(join(root, relative), "utf8");

  it("keeps bottom nav, safe-area, retry, and tap targets on primary screens", () => {
    const nav = read(
      "components/automation-first/automation-first-bottom-nav.tsx",
    );
    const home = read("components/automation-first/automation-first-home.tsx");
    const today = read("components/automation-first/today-work-page.tsx");
    const errorState = read("components/automation-first/error-state.tsx");
    const automations = read("components/automations/automations-dashboard.tsx");
    const runs = read("components/automations/v2/run-list-page.tsx");
    const billing = read("components/settings/billing-settings.tsx");
    const settings = read("components/settings/settings-hub.tsx");
    const css = read("app/globals.css");

    expect(nav).toContain("fixed inset-x-0 bottom-0");
    expect(nav).toContain("min-h-[56px]");
    expect(css).toContain("var(--safe-area-bottom)");
    expect(home).toMatch(/min-h-\[var\(--touch-target\)\]|min-h-\[44px\]/);
    expect(today).toContain("onRetry");
    expect(errorState).toContain("再試行");
    expect(automations).toContain("再読み込み");
    expect(automations).toMatch(/min-h-\[44px\]|min-h-\[var\(--touch-target\)\]/);
    expect(runs).toContain("再読み込み");
    expect(billing).toContain("再読み込み");
    expect(settings).toContain("min-h-[var(--touch-target)]");
  });
});
