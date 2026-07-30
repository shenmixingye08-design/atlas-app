import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDeliverables } from "@/lib/deliverables/engine";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import {
  advanceWordJobStage,
  claimWordJob,
  completeWordJob,
  failStaleRunningWordJobs,
  failWordJob,
  getWordJob,
  isWordJobTerminal,
  resetWordJobsForTests,
} from "@/lib/deliverables/word-job-stages";
import {
  executeWorkJob,
  isStaleWorkJobRunning,
  WORK_JOB_STALE_RUNNING_MS,
} from "@/lib/work-jobs/run";
import { saveWorkJob, type WorkJobRecord } from "@/lib/work-jobs/store";

const OWNER = "user_terminal_guarantee";

const SALES = `# 営業報告書

## 概要
本日の営業活動について報告いたします。顧客訪問と提案内容を整理しました。

## 活動内容
訪問先は株式会社サンプルです。課題ヒアリングを実施し、自動化提案を提示しました。
数値目標と担当者、期限も合わせて整理し、社内共有まで進めます。

## 次のアクション
見積書を作成し、来週フォローし、社内共有を行います。追加の資料も準備します。
`;

describe("job terminal guarantee (no stuck 処理中)", () => {
  beforeEach(() => {
    resetWordJobsForTests();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
  });

  afterEach(() => {
    resetWordJobsForTests();
  });

  it("failWordJob writes failed (terminal), never awaiting_resume", async () => {
    const jobId = "term_fail_status";
    const claim = await claimWordJob({
      jobId,
      userId: OWNER,
      assignment: "Word作成",
      sourceContent: SALES,
      baseFileName: "営業報告書",
    });
    expect(claim.ok).toBe(true);
    await failWordJob(jobId, "DOCX_STORAGE_STARTED", "storage_failed");
    const stopped = await getWordJob(jobId);
    expect(stopped?.status).toBe("failed");
    expect(isWordJobTerminal(stopped!.status)).toBe(true);
  });

  it("failWordJob does not downgrade completed", async () => {
    const jobId = "term_no_downgrade";
    await claimWordJob({
      jobId,
      userId: OWNER,
      assignment: "Word作成",
      sourceContent: SALES,
      baseFileName: "営業報告書",
    });
    await completeWordJob(jobId, "dlv_done");
    const afterFail = await failWordJob(jobId, "DOCX_STORAGE_STARTED", "late");
    expect(afterFail?.status).toBe("completed");
  });

  it("Word generate success ends completed", async () => {
    const jobId = "term_word_ok";
    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成",
        finalDeliverable: SALES,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId },
    );
    expect(result.deliverables.some((d) => d.format === "docx")).toBe(true);
    const job = await getWordJob(jobId);
    expect(job?.status).toBe("completed");
  });

  it("DOWNLOAD_READY short-circuit completes the job", async () => {
    const jobId = "term_download_ready";
    const claim = await claimWordJob({
      jobId,
      userId: OWNER,
      assignment: "営業報告書をWordで作成",
      sourceContent: SALES,
      baseFileName: "営業報告書",
      workerId: "worker_a",
    });
    expect(claim.ok).toBe(true);
    await advanceWordJobStage(jobId, "DOWNLOAD_READY", {
      deliverableId: "dlv_existing",
    });
    // Leave status running intentionally (pre-fix bug state).
    const mid = await getWordJob(jobId);
    expect(mid?.status).toBe("running");

    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成",
        finalDeliverable: SALES,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId, workerId: "worker_a" },
    );
    expect(result.deliverables[0]?.id).toBe("dlv_existing");
    const job = await getWordJob(jobId);
    expect(job?.status).toBe("completed");
  });

  it("non-docx generation does not leave a running Word job", async () => {
    const jobId = "term_pdf_only";
    await generateDeliverables(
      {
        assignment: "要約をPDFで出力",
        finalDeliverable: SALES,
        formats: ["pdf"],
      },
      "http://localhost",
      { userId: OWNER, jobId },
    );
    const job = await getWordJob(jobId);
    // No Word job claimed for pdf-only.
    expect(job).toBeNull();
  });

  it("throw after claim ends as failed via finally", async () => {
    const jobId = "term_throw";
    const store = await import("@/lib/deliverables/store");
    const spy = vi
      .spyOn(store, "saveDeliverableFileDurableDetailed")
      .mockRejectedValueOnce(new Error("persist_boom"));

    await expect(
      generateDeliverables(
        {
          assignment: "営業報告書をWordで作成",
          finalDeliverable: SALES,
          formats: ["docx"],
        },
        "http://localhost",
        { userId: OWNER, jobId },
      ),
    ).rejects.toThrow(/persist_boom/);

    const job = await getWordJob(jobId);
    expect(job?.status).toBe("failed");
    spy.mockRestore();
  });

  it("failStaleRunningWordJobs forces failed on expired lease", async () => {
    const jobId = "term_stale";
    await claimWordJob({
      jobId,
      userId: OWNER,
      assignment: "Word",
      sourceContent: SALES,
      baseFileName: "x",
    });
    const current = await getWordJob(jobId);
    expect(current?.status).toBe("running");
    // Force expired lease + old updatedAt via bucket mutation through fail path setup
    const bucket = (
      globalThis as typeof globalThis & {
        __atlasDeliverableJobs?: Map<string, { status: string }>;
      }
    ).__atlasDeliverableJobs;
    const row = bucket?.get(jobId) as {
      leaseExpiresAt: string;
      updatedAt: string;
      status: string;
    };
    row.leaseExpiresAt = new Date(Date.now() - 60_000).toISOString();
    row.updatedAt = new Date(Date.now() - 60_000 * 10).toISOString();
    const n = await failStaleRunningWordJobs();
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await getWordJob(jobId))?.status).toBe("failed");
  });

  it("same workerId can reclaim; resume path does not deadlock", async () => {
    const jobId = "term_resume_worker";
    const workerId = "stable_resume_worker";
    await claimWordJob({
      jobId,
      userId: OWNER,
      assignment: "営業報告書をWordで作成",
      sourceContent: SALES,
      baseFileName: "営業報告書",
      workerId,
    });
    await failWordJob(jobId, "DOCX_GENERATION_STARTED", "mid_fail");
    expect((await getWordJob(jobId))?.status).toBe("failed");

    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成",
        finalDeliverable: SALES,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId, workerId },
    );
    expect(result.deliverables.some((d) => d.format === "docx")).toBe(true);
    expect((await getWordJob(jobId))?.status).toBe("completed");
  });
});

describe("work-job stale running recovery", () => {
  it("detects stale running past WORK_JOB_STALE_RUNNING_MS", () => {
    const job: WorkJobRecord = {
      id: "wj1",
      userId: OWNER,
      assignment: "x",
      idempotencyKey: "k",
      metadata: {},
      status: "running",
      attemptCount: 1,
      maxAttempts: 2,
      error: null,
      visionGate: null,
      result: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(Date.now() - WORK_JOB_STALE_RUNNING_MS - 1000).toISOString(),
      completedAt: null,
    };
    expect(isStaleWorkJobRunning(job)).toBe(true);
  });

  it("stale running at maxAttempts is forced to failed", async () => {
    const id = "wj_force_fail";
    const staleAt = new Date(
      Date.now() - WORK_JOB_STALE_RUNNING_MS - 5_000,
    ).toISOString();
    saveWorkJob({
      id,
      userId: OWNER,
      assignment: "止まっている仕事",
      idempotencyKey: `key_${id}`,
      metadata: {},
      status: "running",
      attemptCount: 3,
      maxAttempts: 3,
      error: null,
      visionGate: null,
      result: null,
      createdAt: staleAt,
      updatedAt: staleAt,
      completedAt: null,
    });

    const out = await executeWorkJob(id, OWNER);
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/長時間停止/);
  });
});
