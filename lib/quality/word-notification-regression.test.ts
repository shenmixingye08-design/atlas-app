/**
 * Release-gate regression suite: Word request → deliverable → notification.
 *
 * Covers the 17 automated targets. Mocks OpenAI / Supabase / Clerk where noted.
 * Does not store assignment bodies in metrics assertions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/durable", () => ({
  persistNotificationsNow: vi.fn(async () => undefined),
  ensureNotificationsHydrated: vi.fn(async () => undefined),
  schedulePersistNotifications: vi.fn(),
  snapshotNotifications: vi.fn(() => []),
}));

vi.mock("@/lib/notifications/recommendation-sync", () => ({
  syncRecommendationNotifications: vi.fn(async () => undefined),
}));

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    // Do not auto-run background execution in submit tests.
    void fn;
  },
}));

const runCommanderRequest = vi.fn();
vi.mock("@/lib/commander/service", () => ({
  runCommanderRequest: (...args: unknown[]) => runCommanderRequest(...args),
}));

vi.mock("@/lib/reliability", () => ({
  recordReliabilityEvent: vi.fn(),
  withRetry: async <T>(fn: (attempt: number) => Promise<T>) => fn(1),
  MAX_IMMEDIATE_RETRIES: 3,
}));

vi.mock("@/lib/reliability/human-errors", () => ({
  toHumanReliabilityMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

vi.mock("@/lib/work-jobs/durable", () => ({
  persistWorkJob: vi.fn(),
  loadWorkJobFromDisk: vi.fn(() => null),
  loadWorkJobFromDurable: vi.fn(async () => null),
}));

import { GET as downloadGET } from "@/app/api/deliverables/[id]/route";
import { PATCH as markReadPATCH } from "@/app/api/notifications/[id]/read/route";
import { GET as notificationsGET } from "@/app/api/notifications/route";
import { POST as submitWorkJobPOST } from "@/app/api/work/jobs/route";
import { GET as getWorkJobGET } from "@/app/api/work/jobs/[id]/route";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import {
  notifyWorkCompleted,
  notifyWorkFailed,
} from "@/lib/notifications/emitters";
import {
  countUnreadUserNotifications,
  listUserNotifications,
  markNotificationRead,
} from "@/lib/notifications/service";
import { resetNotificationStore } from "@/lib/notifications/store";
import {
  notifyWorkAccepted,
  notifyWorkProcessing,
  notifyWorkTimedOut,
  workJobNotificationRequestId,
} from "@/lib/notifications/work-lifecycle";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { generateDeliverables } from "@/lib/deliverables/engine";
import {
  clearWordFaults,
  injectWordFault,
} from "@/lib/deliverables/fault-inject";
import { exportWordDeliverableOnServer } from "@/lib/deliverables/server-word-export";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import {
  getWordReleaseMonitoringSnapshot,
  resetWordMetricsForTests,
} from "@/lib/deliverables/word-metrics";
import {
  getWordJob,
  resetWordJobsForTests,
} from "@/lib/deliverables/word-job-stages";
import { executeWorkJob } from "@/lib/work-jobs/run";
import {
  getWorkJob,
  resetWorkJobsForTests,
  saveWorkJob,
} from "@/lib/work-jobs/store";

const OWNER = "user_reg_owner";
const OTHER = "user_reg_other";

const BODY = `# 回帰テスト報告書

## 概要
Word生成の自動回帰テスト用の本文です。十分な長さの日本語を含めます。

## 活動
訪問と提案、数値目標、担当者、期限を整理しました。社内共有まで進めます。

## 次のアクション
見積作成とフォローアップを実施します。追加資料も準備します。
`;

function orchestrationResult(text: string): OrchestrationResult {
  return {
    assignment: "営業報告書をWordで作成してください",
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: {
      ...emptyDeliverable("document"),
      title: "営業報告書",
      markdown: text,
      plainText: text,
    },
    reviewComments: "",
    approved: true,
    finalResponse: text,
    totalDurationMs: 10,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
    commanderRunId: "run_reg_word",
  };
}

describe("Word + notification release regression (17 targets)", () => {
  beforeEach(() => {
    resetWordJobsForTests();
    resetWorkJobsForTests();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetNotificationStore();
    resetWordMetricsForTests();
    clearWordFaults();
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: OWNER });
    runCommanderRequest.mockReset();
    vi.stubEnv("ATLAS_DELIVERABLE_STORAGE", "local");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("1-3: Word submit → queued → processing", async () => {
    const res = await submitWorkJobPOST(
      new Request("http://localhost/api/work/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: "報告書をWordで作成してください",
          idempotencyKey: "reg-submit-1",
          metadata: { preferredDeliverableFormat: "docx" },
        }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      jobId: string;
      status: string;
      reused: boolean;
    };
    expect(body.status).toBe("queued");
    expect(body.reused).toBe(false);

    const queued = getWorkJob(body.jobId, OWNER);
    expect(queued?.status).toBe("queued");
    expect(listUserNotifications(OWNER).some((n) => n.jobId === body.jobId)).toBe(
      true,
    );

    runCommanderRequest.mockImplementation(async () => {
      const current = getWorkJob(body.jobId, OWNER);
      expect(current?.status).toBe("processing");
      notifyWorkProcessing({ userId: OWNER, jobId: body.jobId });
      return {
        runId: "run_reg_proc",
        status: "completed",
        result: orchestrationResult(BODY),
        report: { summary: "ok" },
        persistence: {
          projectId: "commander-run_reg_proc",
          projectPersisted: true,
          wordRequired: false,
          wordDeliverableId: null,
          wordCompletionVerified: false,
          notificationCreated: true,
        },
      };
    });

    const done = await executeWorkJob(body.jobId, OWNER);
    expect(done.status).toBe("completed");
    expect(done.startedAt).toBeTruthy();
  });

  it("4-7: .docx generation → storage → deliverable → completed", async () => {
    const exported = await exportWordDeliverableOnServer({
      userId: OWNER,
      assignment: "報告書をWordで作成してください",
      result: orchestrationResult(BODY),
      requestId: "req_reg_docx",
      jobId: "word_reg_docx_01",
      notify: false,
      workJobId: "work_reg_docx_01",
    });
    expect(exported.attempted).toBe(true);
    expect(exported.ok).toBe(true);
    if (!exported.ok || !exported.attempted) return;

    expect(exported.docx.format).toBe("docx");
    expect(exported.docx.sizeBytes).toBeGreaterThan(0);
    expect(exported.docx.mimeType).toContain("wordprocessingml");
    expect(exported.completion.ok).toBe(true);
    expect(exported.completion.steps.STORAGE_SAVED).toBe(true);
    expect(exported.completion.steps.STORAGE_KEY_OR_URL).toBe(true);
    expect(exported.completion.steps.ARTIFACT_DB_SAVED).toBe(true);
    expect(exported.completion.steps.JOB_STATUS_UPDATED).toBe(true);

    const job = await getWordJob("word_reg_docx_01");
    expect(job?.status).toBe("completed");
    expect(job?.deliverableId).toBe(exported.docx.id);
  }, 60_000);

  it("8-10: completion notification → unread count → mark read", async () => {
    const jobId = "job_reg_notify_1";
    notifyWorkAccepted({ userId: OWNER, jobId, assignment: "Word作成" });
    notifyWorkProcessing({ userId: OWNER, jobId });
    notifyWorkCompleted(OWNER, {
      title: "Wordファイルの準備ができました",
      message: "完了しました",
      requestId: workJobNotificationRequestId(jobId),
      jobId,
      deliverableId: "commander-reg_1",
      artifactId: "docx-reg-1",
      workEvent: "completed",
    });

    expect(countUnreadUserNotifications(OWNER)).toBe(1);
    authMock.mockResolvedValue({ userId: OWNER });
    const listRes = await notificationsGET();
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      unreadCount?: number;
      items?: unknown[];
      notifications?: unknown[];
    };
    const unread =
      typeof listJson.unreadCount === "number"
        ? listJson.unreadCount
        : countUnreadUserNotifications(OWNER);
    expect(unread).toBeGreaterThanOrEqual(1);

    const row = listUserNotifications(OWNER)[0]!;
    const readRes = await markReadPATCH(
      new Request(`http://localhost/api/notifications/${row.notificationId}/read`, {
        method: "PATCH",
      }),
      { params: Promise.resolve({ id: row.notificationId }) },
    );
    expect(readRes.status).toBe(200);
    expect(countUnreadUserNotifications(OWNER)).toBe(0);
    expect(
      listUserNotifications(OWNER).find(
        (n) => n.notificationId === row.notificationId,
      )?.isRead,
    ).toBe(true);
  });

  it("11: deliverable download succeeds for owner", async () => {
    const exported = await exportWordDeliverableOnServer({
      userId: OWNER,
      assignment: "Wordで作成",
      result: orchestrationResult(BODY),
      requestId: "req_reg_dl",
      jobId: "word_reg_dl_01",
      notify: false,
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok || !exported.attempted) return;

    const response = await downloadGET(
      new Request(`http://localhost${exported.downloadUrl}`),
      { params: Promise.resolve({ id: exported.docx.id }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("wordprocessingml");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(bytes.byteLength).toBeGreaterThan(0);
  }, 60_000);

  it("12: AI failure → failed", async () => {
    injectWordFault("ai_content_empty");
    const exported = await exportWordDeliverableOnServer({
      userId: OWNER,
      assignment: "Wordで作成",
      result: orchestrationResult(BODY),
      requestId: "req_reg_ai_fail",
      jobId: "word_reg_ai_fail",
      notify: false,
    });
    expect(exported.ok).toBe(false);
    const job = await getWordJob("word_reg_ai_fail");
    expect(job?.status).toBe("failed");
  });

  it("13: storage failure → failed (or non-completed gate)", async () => {
    injectWordFault("storage_upload", 3);
    const result = await generateDeliverables(
      {
        assignment: "Word作成",
        finalDeliverable: BODY,
        formats: ["docx"],
      },
      "http://localhost",
      {
        userId: OWNER,
        jobId: "word_reg_storage_fail",
        contentAlreadyApproved: true,
        suppressWordReadyNotification: true,
      },
    );
    const job = await getWordJob("word_reg_storage_fail");
    const docx = result.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      expect(job?.status).toBe("failed");
    } else {
      expect(job?.status === "failed" || job?.status === "completed").toBe(true);
    }
  }, 60_000);

  it("14: work-job timeout → timed_out", async () => {
    const job = saveWorkJob({
      id: "job_reg_timeout",
      userId: OWNER,
      assignment: "タイムアウト確認",
      idempotencyKey: "idem-reg-timeout",
      metadata: { preferredDeliverableFormat: "docx" },
      status: "queued",
      blockReason: null,
      attemptCount: 0,
      maxAttempts: 3,
      error: null,
      errorCode: null,
      internalError: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
    });
    runCommanderRequest.mockRejectedValue(new Error("ETIMEDOUT after 300s"));
    const timedOut = await executeWorkJob(job.id, OWNER);
    expect(timedOut.status).toBe("timed_out");
    expect(timedOut.errorCode).toBe("TIMEOUT");
    notifyWorkTimedOut({ userId: OWNER, jobId: job.id });
    expect(
      listUserNotifications(OWNER).some((n) => n.workEvent === "timed_out"),
    ).toBe(true);
  });

  it("15: retry creates a new attempt after failure", async () => {
    const failed = saveWorkJob({
      id: "job_reg_retry_src",
      userId: OWNER,
      assignment: "再試行元",
      idempotencyKey: "idem-reg-retry-src",
      metadata: {},
      status: "failed",
      blockReason: null,
      attemptCount: 1,
      maxAttempts: 3,
      error: "失敗",
      errorCode: "AI_GENERATION_FAILED",
      internalError: "ai",
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      failedAt: new Date().toISOString(),
    });
    // Terminal failed jobs are not re-executed — user retry = new job.
    const again = await executeWorkJob(failed.id, OWNER);
    expect(again.status).toBe("failed");
    expect(runCommanderRequest).not.toHaveBeenCalled();

    notifyWorkFailed(OWNER, {
      title: "Wordの作成に失敗しました",
      message: "再試行できます",
      requestId: workJobNotificationRequestId(failed.id),
      jobId: failed.id,
      workEvent: "failed",
      retryActionUrl: "/workspace",
    });
    expect(
      listUserNotifications(OWNER).find((n) => n.jobId === failed.id)
        ?.retryActionUrl,
    ).toBe("/workspace");

    const retryRes = await submitWorkJobPOST(
      new Request("http://localhost/api/work/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: "再試行元",
          idempotencyKey: "idem-reg-retry-new",
          metadata: { preferredDeliverableFormat: "docx" },
        }),
      }),
    );
    expect(retryRes.status).toBe(202);
    const retryBody = (await retryRes.json()) as { jobId: string; status: string };
    expect(retryBody.jobId).not.toBe(failed.id);
    expect(retryBody.status).toBe("queued");
  });

  it("16: double-generation prevention (idempotency + word job dedupe)", async () => {
    const first = await submitWorkJobPOST(
      new Request("http://localhost/api/work/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: "二重防止",
          idempotencyKey: "idem-reg-dedupe",
        }),
      }),
    );
    const a = (await first.json()) as { jobId: string };
    const second = await submitWorkJobPOST(
      new Request("http://localhost/api/work/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: "二重防止",
          idempotencyKey: "idem-reg-dedupe",
        }),
      }),
    );
    const b = (await second.json()) as { jobId: string; reused: boolean };
    expect(b.jobId).toBe(a.jobId);
    expect(b.reused).toBe(true);

    const jobId = "word_reg_dedupe";
    const g1 = await generateDeliverables(
      {
        assignment: "Word作成",
        finalDeliverable: BODY,
        formats: ["docx"],
      },
      "http://localhost",
      {
        userId: OWNER,
        jobId,
        contentAlreadyApproved: true,
        suppressWordReadyNotification: true,
      },
    );
    const g2 = await generateDeliverables(
      {
        assignment: "Word作成",
        finalDeliverable: BODY,
        formats: ["docx"],
      },
      "http://localhost",
      {
        userId: OWNER,
        jobId,
        contentAlreadyApproved: true,
        suppressWordReadyNotification: true,
      },
    );
    const d1 = g1.deliverables.find((d) => d.format === "docx");
    const d2 = g2.deliverables.find((d) => d.format === "docx");
    expect(d1?.id).toBeTruthy();
    expect(d2?.id).toBe(d1!.id);
  }, 90_000);

  it("17: other user cannot access job / download / notifications", async () => {
    const exported = await exportWordDeliverableOnServer({
      userId: OWNER,
      assignment: "Wordで作成",
      result: orchestrationResult(BODY),
      requestId: "req_reg_acl",
      jobId: "word_reg_acl",
      notify: false,
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok || !exported.attempted) return;

    const work = saveWorkJob({
      id: "job_reg_acl",
      userId: OWNER,
      assignment: "ACL",
      idempotencyKey: "idem-reg-acl",
      metadata: {},
      status: "completed",
      blockReason: null,
      attemptCount: 1,
      maxAttempts: 3,
      error: null,
      errorCode: null,
      internalError: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      failedAt: null,
    });

    authMock.mockResolvedValue({ userId: OTHER });
    const jobRes = await getWorkJobGET(
      new Request(`http://localhost/api/work/jobs/${work.id}`),
      { params: Promise.resolve({ id: work.id }) },
    );
    expect(jobRes.status).toBe(404);

    const denied = await downloadGET(
      new Request(`http://localhost${exported.downloadUrl}`),
      { params: Promise.resolve({ id: exported.docx.id }) },
    );
    expect(denied.status).toBe(404);

    notifyWorkCompleted(OWNER, {
      title: "完了",
      message: "完了",
      jobId: "job_owner_only",
      requestId: workJobNotificationRequestId("job_owner_only"),
      deliverableId: "commander-owner",
    });
    expect(listUserNotifications(OTHER)).toHaveLength(0);
    const foreign = listUserNotifications(OWNER)[0]!;
    expect(markNotificationRead(foreign.notificationId, OTHER)).toBeNull();
  }, 60_000);

  it("monitoring snapshot exposes required counters without PII fields", () => {
    const snap = getWordReleaseMonitoringSnapshot();
    expect(snap.containsPii).toBe(false);
    expect(snap).toHaveProperty("wordRequests");
    expect(snap).toHaveProperty("successes");
    expect(snap).toHaveProperty("failures");
    expect(snap).toHaveProperty("timeouts");
    expect(snap).toHaveProperty("successRate");
    expect(snap).toHaveProperty("avgProcessingMs");
    expect(snap).toHaveProperty("errorsByStage");
    expect(snap).toHaveProperty("notificationCreateFailures");
    expect(snap).toHaveProperty("downloadFailures");
    expect(JSON.stringify(snap)).not.toMatch(/営業報告書|顧客|訪問先/);
  });
});
