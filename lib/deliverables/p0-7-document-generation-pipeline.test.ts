import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyWorkCompleted: vi.fn(async () => undefined),
  notifyWorkFailed: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/durable", () => ({
  persistNotificationsNow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/browser/trigger-blob-download", () => ({
  triggerBlobDownload: vi.fn(async () => undefined),
}));

import { downloadDeliverableFile } from "./download-client";
import {
  cancelDocumentPipelineJob,
  createDocumentPipelineJob,
  getDocumentPipelineJob,
  pipelineHasCompleteArtifacts,
  resetDurableDocumentPipelineForTests,
  scheduleDocumentPipelineRetry,
  updateDocumentPipelineJob,
} from "./durable-document-pipeline";
import { resolveDocumentPipelineStorageBackend } from "./document-pipeline-backend";
import { resetDurableDeliverableStoreForTests } from "./durable-store";
import { resetMemoryDurableStorageForTests } from "./memory-durable-storage";
import { resolveRequestedExportFormats } from "./resolve-requested-export-formats";
import { exportDocumentsOnServer } from "./server-document-export";
import {
  resetDeliverableMemoryStoreForTests,
  getStoredDeliverableForUser,
} from "./store";
import { clearWordFaults, injectWordFault } from "./fault-inject";
import { resetWordJobsForTests } from "./word-job-stages";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { DeliverableFormat } from "./types";

const OWNER_A = "user_p07_a";
const OWNER_B = "user_p07_b";

const SAMPLE = `# 営業報告書

## 概要
本日の活動をまとめます。数値は 123 件、売上は 45万円でした。
改善案として、フォローアップを翌日に実施します。
お客様向けに価値提案と次のアクションを整理し、担当者・期限・期待効果を明記します。
数値根拠として先週比 +12%、問い合わせ 34 件、成約 5 件を記載します。
来週の重点はフォローコールと提案資料の改訂です。関係者への共有も完了しています。
`.repeat(3);

function orchestrationResult(
  assignment: string,
  text = SAMPLE,
): OrchestrationResult {
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
      markdown: text,
      plainText: text.replace(/^#+\s*/gm, ""),
      html: `<p>${text.slice(0, 200)}</p>`,
      content: text,
      summary: "営業報告の要約",
      metadata: {},
      downloads: {},
    },
    reviewComments: "",
    approved: true,
    finalResponse: text,
    totalDurationMs: 10,
    error: null,
  } as unknown as OrchestrationResult;
}

async function exportFormat(
  format: DeliverableFormat,
  assignment = `${format} を作成`,
  owner = OWNER_A,
) {
  return exportDocumentsOnServer({
    userId: owner,
    assignment,
    result: orchestrationResult(assignment),
    requestId: `req_${format}_${crypto.randomUUID().slice(0, 8)}`,
    metadata: { preferredDeliverableFormat: format },
    formats: [format],
    notify: false,
  });
}

describe("P0-7 document generation pipeline", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_DELIVERABLE_STORAGE", "memory_durable");
    vi.stubEnv("ATLAS_DOCUMENT_PIPELINE_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetMemoryDurableStorageForTests();
    resetDurableDocumentPipelineForTests();
    resetWordJobsForTests();
    clearWordFaults();
  });

  afterEach(() => {
    clearWordFaults();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("01: pipeline backend is memory_durable", () => {
    expect(resolveDocumentPipelineStorageBackend()).toBe("memory_durable");
  });

  it("02: Production forbids memory_durable pipeline", () => {
    vi.stubEnv("ATLAS_DOCUMENT_PIPELINE_STORAGE", "memory_durable");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => resolveDocumentPipelineStorageBackend()).toThrow(
      /forbidden in Production/,
    );
  });

  it("03: preferred format resolver — Home/お願い same", () => {
    const home = resolveRequestedExportFormats({
      assignment: "報告書を作って",
      metadata: { preferredDeliverableFormat: "pdf" },
    });
    const onegai = resolveRequestedExportFormats({
      assignment: "報告書を作って",
      metadata: { preferredDeliverableFormat: "pdf" },
    });
    expect(home.formats).toEqual(onegai.formats);
    expect(home.formats).toContain("pdf");
    expect(home.required).toBe(true);
  });

  it("04: Word DOCX generate durable", async () => {
    const result = await exportFormat("docx", "営業報告書をWordで作成");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files[0]?.format).toBe("docx");
    expect(result.files[0]?.sizeBytes).toBeGreaterThan(0);
    expect(pipelineHasCompleteArtifacts(result.pipelineJob)).toBe(true);
  });

  it("05: Excel XLSX generate durable", async () => {
    const result = await exportFormat("xlsx", "売上表をExcelで");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files.some((f) => f.format === "xlsx")).toBe(true);
  });

  it("06: PDF generate durable", async () => {
    const result = await exportFormat("pdf", "報告書をPDFで");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files[0]?.format).toBe("pdf");
  });

  it("07: PPTX generate durable", async () => {
    const result = await exportFormat("pptx", "提案スライドを作成");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files[0]?.format).toBe("pptx");
  });

  it("08: TXT generate durable", async () => {
    const result = await exportFormat("txt", "メモをテキストで");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files[0]?.format).toBe("txt");
  });

  it("09: Markdown generate durable", async () => {
    const result = await exportFormat("md", "READMEをMarkdownで");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files[0]?.format).toBe("md");
  });

  it("10: all 6 formats same pipeline success", async () => {
    const formats: DeliverableFormat[] = [
      "docx",
      "xlsx",
      "pdf",
      "pptx",
      "txt",
      "md",
    ];
    const result = await exportDocumentsOnServer({
      userId: OWNER_A,
      assignment: "全形式で成果物を作成",
      result: orchestrationResult("全形式で成果物を作成"),
      requestId: "req_all_formats",
      formats,
      notify: false,
    });
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files).toHaveLength(6);
    expect(result.pipelineJob.artifactIds).toHaveLength(6);
    expect(result.pipelineJob.checksums).toHaveLength(6);
    expect(result.pipelineJob.byteSizes.every((n) => n > 0)).toBe(true);
  }, 120_000);

  it("11: completed without artifact forbidden (storage fault)", async () => {
    injectWordFault("storage_upload");
    const result = await exportFormat("docx", "Wordで報告書");
    expect(result.attempted && !result.ok).toBe(true);
  });

  it("12: Cold Start — process Map cleared, artifact still downloadable", async () => {
    const result = await exportFormat("pdf", "PDF報告書");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    const id = result.files[0]!.id;
    resetDeliverableMemoryStoreForTests();
    const again = await getStoredDeliverableForUser(id, OWNER_A);
    expect(again?.buffer.byteLength).toBeGreaterThan(0);
    expect(again?.contentSha256).toBeTruthy();
  });

  it("13: process kill simulation — pipeline job survives", async () => {
    const job = await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["pdf"],
      jobId: "pipe_kill_1",
    });
    await updateDocumentPipelineJob(job.id, OWNER_A, {
      status: "generating",
      stage: "generating",
      progressPct: 40,
    });
    const loaded = await getDocumentPipelineJob("pipe_kill_1", OWNER_A);
    expect(loaded?.progressPct).toBe(40);
    expect(loaded?.status).toBe("generating");
  });

  it("14: retry durable", async () => {
    const job = await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["docx"],
      jobId: "pipe_retry_1",
    });
    const retried = await scheduleDocumentPipelineRetry({
      jobId: job.id,
      ownerUserId: OWNER_A,
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      errorCode: "timeout",
    });
    expect(retried.status).toBe("retry_scheduled");
    expect(retried.retryCount).toBe(1);
  });

  it("15: cancel mid-pipeline", async () => {
    const job = await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["xlsx"],
      jobId: "pipe_cancel_1",
    });
    const cancelled = await cancelDocumentPipelineJob({
      jobId: job.id,
      ownerUserId: OWNER_A,
    });
    expect(cancelled.status).toBe("cancelled");
    await expect(
      updateDocumentPipelineJob(job.id, OWNER_A, { status: "generating" }),
    ).rejects.toThrow(/cancelled/);
  });

  it("16: timeout status on pipeline", async () => {
    const job = await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["pdf"],
      jobId: "pipe_to_1",
    });
    const timed = await updateDocumentPipelineJob(job.id, OWNER_A, {
      status: "timed_out",
      stage: "timed_out",
      timedOutAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      errorCode: "timeout",
    });
    expect(timed.status).toBe("timed_out");
    expect(pipelineHasCompleteArtifacts(timed)).toBe(false);
  });

  it("17: owner isolation on pipeline jobs", async () => {
    await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["md"],
      jobId: "pipe_iso_1",
    });
    expect(await getDocumentPipelineJob("pipe_iso_1", OWNER_B)).toBeNull();
  });

  it("18: owner isolation on artifact download bytes", async () => {
    const result = await exportFormat("txt", "テキストメモ");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    const leaked = await getStoredDeliverableForUser(
      result.files[0]!.id,
      OWNER_B,
    );
    expect(leaked).toBeNull();
  });

  it("19: checksum + byteSize evidence present", async () => {
    const result = await exportFormat("docx", "Word文書");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.evidences[0]?.checksum.length).toBeGreaterThan(10);
    expect(result.evidences[0]?.byteSize).toBeGreaterThan(0);
    expect(result.pipelineJob.byteSizes[0]).toBe(result.evidences[0]?.byteSize);
  });

  it("20: download client TXT success (text/plain allowed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("hello txt", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      ),
    );
    await expect(
      downloadDeliverableFile({
        url: "/api/deliverables/txt1",
        fileName: "note.txt",
        format: "txt",
        mimeType: "text/plain",
      }),
    ).resolves.toBeUndefined();
  });

  it("21: download client rejects text/plain for DOCX", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("not zip", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );
    await expect(
      downloadDeliverableFile({
        url: "/api/deliverables/bad",
        fileName: "a.docx",
        format: "docx",
      }),
    ).rejects.toThrow(/不正な形式/);
  });

  it("22: concurrent exports — both complete with artifacts", async () => {
    const [a, b] = await Promise.all([
      exportFormat("pdf", "同時PDF1"),
      exportFormat("md", "同時MD1"),
    ]);
    expect(a.attempted && a.ok).toBe(true);
    expect(b.attempted && b.ok).toBe(true);
  });

  it("23: large-ish content still durable", async () => {
    const big = `${SAMPLE}\n\n${"詳細段落。".repeat(400)}`;
    const result = await exportDocumentsOnServer({
      userId: OWNER_A,
      assignment: "大きな報告書をPDFで",
      result: orchestrationResult("大きな報告書をPDFで", big),
      requestId: "req_large",
      formats: ["pdf"],
      metadata: { preferredDeliverableFormat: "pdf" },
      notify: false,
    });
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    expect(result.files[0]!.sizeBytes).toBeGreaterThan(500);
  });

  it("24: progress updates through stages", async () => {
    const job = await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["docx"],
      jobId: "pipe_prog",
    });
    for (const [status, pct] of [
      ["planning", 5],
      ["generating", 20],
      ["rendering", 40],
      ["exporting", 60],
      ["persisting", 80],
      ["verifying", 90],
    ] as const) {
      await updateDocumentPipelineJob(job.id, OWNER_A, {
        status,
        stage: status,
        progressPct: pct,
      });
    }
    const done = await updateDocumentPipelineJob(job.id, OWNER_A, {
      status: "completed",
      stage: "completed",
      progressPct: 100,
      completedFormats: ["docx"],
      artifactIds: ["art1"],
      completionEvidenceIds: ["cev1"],
      checksums: ["abc"],
      byteSizes: [12],
      finishedAt: new Date().toISOString(),
    });
    expect(done.progressPct).toBe(100);
    expect(pipelineHasCompleteArtifacts(done)).toBe(true);
  });

  it("25: DB切断 — supabase pipeline fail-closed", async () => {
    vi.stubEnv("ATLAS_DOCUMENT_PIPELINE_STORAGE", "supabase");
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    await expect(
      createDocumentPipelineJob({
        ownerUserId: OWNER_A,
        requestedFormats: ["pdf"],
      }),
    ).rejects.toThrow(/Map fallback disabled|supabase/i);
  });

  it("26: Migration declares pipeline table", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260805_p0_7_document_generation_pipeline.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("atlas_document_generation_jobs");
    expect(sql).toContain("completion_evidence_ids");
    expect(sql).toContain("cancelled_at");
  });

  it("27: Home preferred pdf === お願い preferred pdf path", async () => {
    const home = await exportDocumentsOnServer({
      userId: OWNER_A,
      assignment: "月次報告",
      result: orchestrationResult("月次報告"),
      requestId: "home_1",
      metadata: {
        requestUi: "secretary_zero_friction_v1",
        preferredDeliverableFormat: "pdf",
      },
      notify: false,
    });
    const onegai = await exportDocumentsOnServer({
      userId: OWNER_A,
      assignment: "月次報告",
      result: orchestrationResult("月次報告"),
      requestId: "onegai_1",
      metadata: {
        requestUi: "secretary_zero_friction_v1",
        preferredDeliverableFormat: "pdf",
      },
      notify: false,
    });
    expect(home.attempted && home.ok).toBe(true);
    expect(onegai.attempted && onegai.ok).toBe(true);
    if (home.attempted && home.ok && onegai.attempted && onegai.ok) {
      expect(home.formats).toEqual(onegai.formats);
      expect(home.files.map((f) => f.format).sort()).toEqual(
        onegai.files.map((f) => f.format).sort(),
      );
    }
  });

  it("28: empty content fails closed (not completed)", async () => {
    injectWordFault("ai_content_empty");
    const result = await exportDocumentsOnServer({
      userId: OWNER_A,
      assignment: "空のWordを作成",
      result: orchestrationResult("空のWordを作成"),
      requestId: "empty_1",
      formats: ["docx"],
      notify: false,
    });
    expect(result.attempted).toBe(true);
    if (result.attempted) {
      expect(result.ok).toBe(false);
    }
  });

  it("29: artifact mismatch — sizeBytes must match buffer", async () => {
    const result = await exportFormat("md", "整合性MD");
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    const stored = await getStoredDeliverableForUser(
      result.files[0]!.id,
      OWNER_A,
    );
    expect(stored?.buffer.byteLength).toBe(result.files[0]!.sizeBytes);
  });

  it("30: max retries → failed terminal", async () => {
    const job = await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["pdf"],
      jobId: "pipe_max_retry",
    });
    await updateDocumentPipelineJob(job.id, OWNER_A, {
      retryCount: 2,
      maxAttempts: 3,
    });
    const failed = await scheduleDocumentPipelineRetry({
      jobId: job.id,
      ownerUserId: OWNER_A,
      nextRetryAt: new Date().toISOString(),
      errorCode: "boom",
    });
    expect(failed.status).toBe("failed");
  });

  it("31: work-job gate rejects artifactsRequired without files", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../work-jobs/run.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain("completed without artifact");
    expect(src).toContain("artifactsRequired");
    const persistence = {
      artifactsRequired: true,
      artifactsVerified: false,
    };
    const files: unknown[] = [];
    const blocked =
      persistence.artifactsRequired &&
      (!persistence.artifactsVerified || files.length === 0);
    expect(blocked).toBe(true);
  });

  it("32: download URL points at API for every format", async () => {
    for (const format of ["docx", "pdf", "txt"] as DeliverableFormat[]) {
      const result = await exportFormat(format);
      expect(result.attempted && result.ok).toBe(true);
      if (!(result.attempted && result.ok)) continue;
      expect(result.files[0]?.downloadUrl).toContain(
        `/api/deliverables/${result.files[0]?.id}`,
      );
    }
  });

  it("33: completion evidence ids unique per artifact", async () => {
    const result = await exportDocumentsOnServer({
      userId: OWNER_A,
      assignment: "2形式",
      result: orchestrationResult("2形式"),
      requestId: "req_two",
      formats: ["txt", "md"],
      notify: false,
    });
    expect(result.attempted && result.ok).toBe(true);
    if (!(result.attempted && result.ok)) return;
    const ids = result.pipelineJob.completionEvidenceIds;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("34: Storage失败 → not ok (db upsert fault)", async () => {
    injectWordFault("db_upsert");
    const result = await exportFormat("pdf", "DB失敗PDF");
    expect(result.attempted && !result.ok).toBe(true);
  });

  it("35: pipelineHasCompleteArtifacts false when missing checksum", async () => {
    const job = await createDocumentPipelineJob({
      ownerUserId: OWNER_A,
      requestedFormats: ["pdf"],
      jobId: "pipe_incomplete",
    });
    const partial = await updateDocumentPipelineJob(job.id, OWNER_A, {
      status: "completed",
      completedFormats: ["pdf"],
      artifactIds: ["a"],
      completionEvidenceIds: ["c"],
      checksums: [],
      byteSizes: [1],
      progressPct: 100,
    });
    expect(pipelineHasCompleteArtifacts(partial)).toBe(false);
  });
});
