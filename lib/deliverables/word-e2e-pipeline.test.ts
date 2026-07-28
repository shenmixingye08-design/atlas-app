import { beforeEach, describe, expect, it } from "vitest";

import {
  assignmentRequestsWordFile,
  detectDeliverableFormats,
} from "@/lib/deliverables/detect-formats";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { logWordPipeline } from "@/lib/deliverables/pipeline-log";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import {
  getWordJob,
  resetWordJobsForTests,
} from "@/lib/deliverables/word-job-stages";
import {
  listStoredNotifications,
  resetNotificationStore,
} from "@/lib/notifications/store";

const OWNER = "user_word_e2e_pipeline";

const BODY = `# 営業報告書

## 概要
本日の営業活動について報告いたします。顧客訪問と提案内容を整理しました。

## 活動内容
訪問先は株式会社サンプルです。課題ヒアリングを実施し、自動化提案を提示しました。
数値目標と担当者、期限も合わせて整理し、社内共有まで進めます。

## 次のアクション
見積書を作成し、来週フォローし、社内共有を行います。追加の資料も準備します。
`;

describe("Word E2E pipeline stability", () => {
  beforeEach(() => {
    resetWordJobsForTests();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetNotificationStore();
  });

  it("detects Wordキーワード without AI", () => {
    expect(detectDeliverableFormats("Word作成して").formats).toContain("docx");
    expect(detectDeliverableFormats("ワードで報告書を作って").formats).toContain(
      "docx",
    );
    expect(assignmentRequestsWordFile("営業報告書をWordで作成")).toBe(true);
    expect(
      assignmentRequestsWordFile("要約して", {
        preferredDeliverableFormat: "docx",
      }),
    ).toBe(true);
    expect(
      assignmentRequestsWordFile("要約して", {
        preferredDeliverableFormat: "pdf",
      }),
    ).toBe(false);
  });

  it("generateDeliverables emits completed notification with download URL", async () => {
    const jobId = "e2e_notify_ok";
    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成",
        finalDeliverable: BODY,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId },
    );
    expect(result.failures).toEqual([]);
    const docx = result.deliverables.find((d) => d.format === "docx");
    expect(docx).toBeTruthy();
    expect(docx!.downloadUrl).toContain(`/api/deliverables/${docx!.id}`);

    const job = await getWordJob(jobId);
    expect(job?.status).toBe("completed");

    const notices = listStoredNotifications({ userId: OWNER });
    const completed = notices.filter((n) => n.type === "completed");
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(completed.some((n) => n.deliverableId === docx!.id)).toBe(true);
  });

  it("quality failure emits failed notification and terminal job status", async () => {
    const jobId = "e2e_notify_fail";
    const result = await generateDeliverables(
      {
        assignment: "Word作成",
        finalDeliverable: "# 題名だけ\n\n## 見出し\n",
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId },
    );
    expect(result.deliverables).toHaveLength(0);
    const job = await getWordJob(jobId);
    expect(job?.status).toBe("failed");
    const notices = listStoredNotifications({ userId: OWNER });
    expect(notices.some((n) => n.type === "error")).toBe(true);
  });

  it("pipeline logger does not throw", () => {
    expect(() =>
      logWordPipeline({
        stage: "REQUEST_ACCEPTED",
        jobId: "x",
        userId: OWNER,
        ok: true,
      }),
    ).not.toThrow();
  });
});
