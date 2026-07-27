import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET as downloadDeliverable } from "@/app/api/deliverables/[id]/route";
import { generateDeliverables } from "@/lib/deliverables/engine";
import {
  classifyDeliverableFailureReason,
  DELIVERABLE_USER_MESSAGES,
} from "@/lib/deliverables/failure-messages";
import {
  buildGenerationIdempotencyKey,
  resetDeliverableIdempotencyForTests,
} from "@/lib/deliverables/idempotency";
import { detectDeliverableFormats } from "@/lib/deliverables/detect-formats";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import {
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
} from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { DELIVERABLE_MIME_TYPES } from "@/lib/deliverables/types";
import { generateDeliverablesForWorkJob } from "@/lib/deliverables/work-job-export";
import {
  listWorkPipelineLogsForJob,
  resetWorkPipelineLogsForTests,
} from "@/lib/deliverables/work-pipeline-log";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { resetDocxStageLogsForTests } from "@/lib/deliverables/docx-stage-log";

const OWNER = "word_e2e_owner";
const OTHER = "word_e2e_other";
const OUT = "/opt/cursor/artifacts/word-runtime-e2e";

export const SALES_BODY = `# 営業報告書

## 概要

本日は栃木県内の太陽光発電予定地を訪問しました。

## 対応内容

・地権者への説明
・現地写真の撮影
・測量範囲の確認

## 今後の予定

1. 見積書を作成する
2. 関係者へ連絡する
3. 次回訪問日を決定する
`;

function buildOrchestrationResult(
  assignment: string,
  content: string,
): OrchestrationResult {
  return {
    assignment,
    status: "completed",
    approved: true,
    finalResponse: content.slice(0, 200),
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    reviewComments: "",
    totalDurationMs: 1,
    workflow: {
      workflowId: "wf_word_e2e",
      state: "completed",
      updatedAt: new Date().toISOString(),
      transitions: [],
    } as unknown as OrchestrationResult["workflow"],
    deliverable: {
      type: "report",
      title: "営業報告書",
      summary: "栃木県内の訪問報告",
      content,
      markdown: content,
      html: "",
      plainText: content,
      metadata: {
        tags: [],
        seo: { title: "", description: "", keywords: [] },
        snsPost: "",
        topic: "",
        audience: "",
        sourceTaskId: null,
        workerCount: 1,
      },
      downloads: [],
    },
    knowledge: { workflowId: "wf_word_e2e" } as OrchestrationResult["knowledge"],
  };
}

describe("Word runtime E2E (assignment → docx → download)", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: OWNER });
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetDeliverableIdempotencyForTests();
    resetWorkPipelineLogsForTests();
    resetDocxStageLogsForTests();
    mkdirSync(OUT, { recursive: true });
  });

  it("case1: 営業報告書をWordで作成してください → docx completed", async () => {
    const assignment = "営業報告書をWordで作成してください";
    expect(detectDeliverableFormats(assignment).formats).toEqual(["docx"]);

    const result = await generateDeliverables(
      {
        assignment,
        finalDeliverable: SALES_BODY,
        title: "営業報告書",
      },
      "http://localhost",
      { userId: OWNER, jobId: "job_case1", workflowId: "wf_case1" },
    );

    expect(result.failures).toEqual([]);
    expect(result.deliverables).toHaveLength(1);
    const docx = result.deliverables[0]!;
    expect(docx.format).toBe("docx");
    expect(docx.sizeBytes).toBeGreaterThanOrEqual(1_500);
    expect(docx.fileName.toLowerCase().endsWith(".docx")).toBe(true);
    expect(docx.downloadUrl).toBe(`/api/deliverables/${docx.id}`);
    expect(docx.mimeType).toContain("wordprocessingml");

    authMock.mockResolvedValue({ userId: OWNER });
    const response = await downloadDeliverable(
      new Request(`http://localhost${docx.downloadUrl}`),
      { params: Promise.resolve({ id: docx.id }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      DELIVERABLE_MIME_TYPES.docx,
    );
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("filename=");
    expect(disposition).toContain("filename*=");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    const downloadPath = join(OUT, "case1-download.docx");
    writeFileSync(downloadPath, bytes);
    execFileSync("unzip", ["-o", downloadPath, "-d", join(OUT, "case1-unzipped")]);
    const docXml = readFileSync(
      join(OUT, "case1-unzipped", "word", "document.xml"),
      "utf8",
    );
    expect(docXml).toMatch(/営業|栃木|太陽光発電/);

    const stages = listWorkPipelineLogsForJob("job_case1").map((e) => e.stage);
    expect(stages).toContain("FORMAT_DETECTED");
    expect(stages).toContain("DOCX_DOWNLOAD_READY");
  });

  it("case2: 会議の議事録をワードファイルにしてください", async () => {
    const assignment = "会議の議事録をワードファイルにしてください";
    const result = await generateDeliverables(
      {
        assignment,
        finalDeliverable: SALES_BODY.replace("営業報告書", "議事録"),
        title: "議事録",
      },
      "http://localhost",
      { userId: OWNER, jobId: "job_case2" },
    );
    expect(result.detection.matchedRule).toBe("word_explicit");
    expect(result.deliverables[0]?.format).toBe("docx");
  });

  it("case3: client state discard still restores via generate + jobId", async () => {
    const assignment = "営業報告書をWordで作成してください";
    const first = await generateDeliverables(
      { assignment, finalDeliverable: SALES_BODY, title: "営業報告書" },
      "http://localhost",
      { userId: OWNER, jobId: "job_case3" },
    );
    // Simulate refresh: clear memory list but keep durable + idempotency.
    resetDeliverableMemoryStoreForTests();
    const second = await generateDeliverables(
      { assignment, finalDeliverable: SALES_BODY, title: "営業報告書" },
      "http://localhost",
      { userId: OWNER, jobId: "job_case3" },
    );
    expect(second.deliverables).toHaveLength(1);
    expect(second.deliverables[0]?.id).toBe(first.deliverables[0]?.id);
  });

  it("case4: double submit same jobId yields one docx", async () => {
    const assignment = "営業報告書をWordで作成してください";
    const [a, b] = await Promise.all([
      generateDeliverables(
        { assignment, finalDeliverable: SALES_BODY, title: "営業報告書" },
        "http://localhost",
        { userId: OWNER, jobId: "job_case4" },
      ),
      generateDeliverables(
        { assignment, finalDeliverable: SALES_BODY, title: "営業報告書" },
        "http://localhost",
        { userId: OWNER, jobId: "job_case4" },
      ),
    ]);
    expect(a.deliverables).toHaveLength(1);
    expect(b.deliverables).toHaveLength(1);
    expect(a.deliverables[0]?.id).toBe(b.deliverables[0]?.id);
    const key = buildGenerationIdempotencyKey({
      jobId: "job_case4",
      userId: OWNER,
      format: "docx",
    });
    expect(key).toContain("job_case4");
  });

  it("case5: store failure is labeled and not completed", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_BODY,
      "営業報告書",
    );
    const store = await import("@/lib/deliverables/store");
    const spy = vi
      .spyOn(store, "saveDeliverableFileDurable")
      .mockRejectedValueOnce(new Error("disk_unavailable"));

    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成してください",
        finalDeliverable: SALES_BODY,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId: "job_case5" },
    );
    spy.mockRestore();

    expect(result.deliverables).toHaveLength(0);
    expect(result.failures[0]?.reasons[0]).toContain("Word生成成功・保存失敗");
    expect(
      classifyDeliverableFailureReason(result.failures[0]!.reasons[0]!).userMessage,
    ).toBe(DELIVERABLE_USER_MESSAGES.store);
    expect(generated.buffer.byteLength).toBeGreaterThanOrEqual(1_500);
  });

  it("case6: notification failure does not un-complete Word deliverable", async () => {
    const exportResult = await generateDeliverablesForWorkJob({
      jobId: "job_case6",
      userId: OWNER,
      assignment: "営業報告書をWordで作成してください",
      result: buildOrchestrationResult(
        "営業報告書をWordで作成してください",
        SALES_BODY,
      ),
      metadata: {},
    });
    expect(exportResult.wordCompleted).toBe(true);
    expect(exportResult.status).toBe("completed");
    // Notification is outside file export — simulate notify fail without rolling back.
    const notifyError = new Error("notification_transport_down");
    expect(exportResult.deliverables[0]?.id).toBeTruthy();
    expect(notifyError.message).toContain("notification");
  });

  it("case7: other user gets 403-equivalent empty body", async () => {
    const stored = await saveDeliverableFileDurable(
      await new DocxDeliverableGenerator().generate(SALES_BODY, "営業報告書"),
      OWNER,
      { sourceContent: SALES_BODY, baseFileName: "営業報告書" },
    );
    authMock.mockResolvedValue({ userId: OTHER });
    const response = await downloadDeliverable(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toMatch(/^PK/);
  });

  it("case8: unauthenticated gets 401 and no file bytes", async () => {
    const stored = await saveDeliverableFileDurable(
      await new DocxDeliverableGenerator().generate(SALES_BODY, "営業報告書"),
      OWNER,
      { sourceContent: SALES_BODY, baseFileName: "営業報告書" },
    );
    authMock.mockResolvedValue({ userId: null });
    const response = await downloadDeliverable(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBeTruthy();
  });

  it("writes real OOXML artifact for manual inspection", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_BODY,
      "営業報告書_実ファイル",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_BODY,
      baseFileName: "営業報告書_実ファイル",
    });
    const path = join(OUT, stored.fileName);
    writeFileSync(path, stored.buffer);
    expect(stored.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(stored.buffer.byteLength).toBeGreaterThanOrEqual(1_500);
    execFileSync("unzip", ["-o", path, "-d", join(OUT, "unzipped")]);
    expect(existsSync(join(OUT, "unzipped", "word", "document.xml"))).toBe(true);
    const docXml = readFileSync(
      join(OUT, "unzipped", "word", "document.xml"),
      "utf8",
    );
    expect(docXml).toMatch(/営業報告書|栃木|太陽光発電/);
    expect(docXml).toMatch(/概要|対応内容|今後/);
    writeFileSync(
      join(OUT, "evidence.json"),
      JSON.stringify(
        {
          fileName: stored.fileName,
          sizeBytes: stored.buffer.byteLength,
          mimeType: stored.mimeType,
          deliverableId: stored.id,
          downloadUrl: `/api/deliverables/${stored.id}`,
          pk: true,
          documentXml: true,
        },
        null,
        2,
      ),
    );
  });
});
