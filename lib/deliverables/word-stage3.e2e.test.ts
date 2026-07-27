import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET } from "@/app/api/deliverables/[id]/route";
import {
  clearWordFaults,
  injectWordFault,
} from "@/lib/deliverables/fault-inject";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { sha256Hex } from "@/lib/deliverables/integrity";
import {
  notifyWorkCompleted,
  notifyWorkFailed,
} from "@/lib/notifications/emitters";
import { listStoredNotifications } from "@/lib/notifications/store";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
} from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import {
  claimWordJob,
  getWordJob,
  resetWordJobsForTests,
  stageReached,
} from "@/lib/deliverables/word-job-stages";

const OWNER = "stage3_owner";
const OTHER = "stage3_other";

const SALES_REPORT = `# 営業報告書

## 概要
本日の営業活動について報告いたします。顧客訪問と提案内容を整理しました。

## 活動内容
訪問先は株式会社サンプルです。課題ヒアリングを実施し、自動化提案を提示しました。
数値目標と担当者、期限も合わせて整理し、社内共有まで進めます。

## 次のアクション
見積書を作成し、来週フォローし、社内共有を行います。追加の資料も準備します。
`;

describe("Word Stage 3 production hardening", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: OWNER });
    clearWordFaults();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetWordJobsForTests();
  });

  it("scenario1: normal generate → persist → download → sha256 match", async () => {
    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成してください",
        finalDeliverable: SALES_REPORT,
        title: "営業報告書",
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId: "job_normal_1" },
    );

    expect(result.failures).toEqual([]);
    const docx = result.deliverables.filter((d) => d.format === "docx");
    expect(docx).toHaveLength(1);
    const meta = docx[0]!;
    expect(meta.downloadUrl).toBe(`/api/deliverables/${meta.id}`);

    const stored = await getStoredDeliverableForUser(meta.id, OWNER);
    expect(stored).not.toBeNull();
    const expectedSha = sha256Hex(stored!.buffer);

    const response = await GET(new Request(`http://localhost${meta.downloadUrl}`), {
      params: Promise.resolve({ id: meta.id }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("wordprocessingml");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(sha256Hex(bytes)).toBe(expectedSha);
    expect(response.headers.get("X-Atlas-Content-SHA256")).toBe(expectedSha);

    const job = await getWordJob("job_normal_1");
    expect(job?.status).toBe("completed");
    expect(stageReached(job!.stage, "COMPLETED")).toBe(true);
  });

  it("scenario3: memory cleared + disk bypass → durable/regenerate still works", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT,
      "営業報告書",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_REPORT,
      baseFileName: "営業報告書",
    });
    const sha = sha256Hex(stored.buffer);

    resetDeliverableMemoryStoreForTests();
    const reloaded = await getStoredDeliverableForUser(stored.id, OWNER, {
      bypassDisk: true,
    });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    // Regenerated or hydrated — still valid OOXML
    expect(reloaded!.buffer.byteLength).toBeGreaterThan(1500);

    authMock.mockResolvedValue({ userId: OWNER });
    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    // If hydrated from same base64, sha matches; if regenerated, still PK-valid.
    if (bytes.byteLength === stored.buffer.byteLength) {
      expect(sha256Hex(bytes)).toBe(sha);
    }
  });

  it("scenario4: sha256 mismatch triggers recovery and returns valid docx", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT,
      "営業報告書",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_REPORT,
      baseFileName: "営業報告書",
    });

    injectWordFault("sha256_mismatch_on_download");
    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(bytes.byteLength).toBeGreaterThan(1500);
  });

  it("scenario5: storage fault marks job resumable from storage stage", async () => {
    // Force storage upload fault — in local backend upload is skipped, so
    // inject db_upsert to simulate durable persist failure path via fault on storage.
    // Local backend treats storage as local success; use parallel + resume instead.
    const jobId = "job_resume_storage";
    const claim1 = await claimWordJob({
      jobId,
      userId: OWNER,
      assignment: "Word作成",
      sourceContent: SALES_REPORT,
      baseFileName: "営業報告書",
    });
    expect(claim1.ok).toBe(true);

    // Simulate stop after DOCX_GENERATION_COMPLETED
    const { advanceWordJobStage, failWordJob } = await import(
      "@/lib/deliverables/word-job-stages"
    );
    await advanceWordJobStage(jobId, "DOCX_GENERATION_COMPLETED");
    await failWordJob(jobId, "DOCX_STORAGE_STARTED", "storage_failed");

    const stopped = await getWordJob(jobId);
    expect(stopped?.status).toBe("awaiting_resume");
    expect(stageReached(stopped!.stage, "DOCX_GENERATION_COMPLETED")).toBe(true);

    // Resume from last success — should not require AI again
    const claim2 = await claimWordJob({
      jobId,
      userId: OWNER,
      assignment: "Word作成",
      sourceContent: SALES_REPORT,
      baseFileName: "営業報告書",
    });
    expect(claim2.ok).toBe(true);
    expect(stageReached(claim2.job.stage, "DOCX_GENERATION_COMPLETED")).toBe(true);
  });

  it("scenario6: notification failure does not undo completed deliverable", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT,
      "営業報告書",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_REPORT,
      baseFileName: "営業報告書",
    });

    const completed = notifyWorkCompleted(OWNER, {
      title: "報告書を作成しました",
      message: "Wordの準備ができました。",
      deliverableId: stored.id,
      requestId: "req_notify_1",
    });
    expect(completed?.type).toBe("completed");

    // Side-channel notify failure must not downgrade completed notification.
    injectWordFault("notification_send");
    const failed = notifyWorkFailed(OWNER, {
      title: "通知失敗",
      message: "通知だけ失敗",
      deliverableId: stored.id,
      requestId: "req_notify_1",
    });
    expect(failed?.type).toBe("completed");
    expect(failed?.deliverableId).toBe(stored.id);

    const list = listStoredNotifications({ userId: OWNER }).filter(
      (n) => n.requestId === "req_notify_1",
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.type).toBe("completed");
  });

  it("scenario7: empty AI content is rejected before Word conversion", async () => {
    injectWordFault("ai_content_empty");
    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成",
        finalDeliverable: SALES_REPORT,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId: "job_empty_ai" },
    );
    expect(result.deliverables).toHaveLength(0);
    expect(result.failures[0]?.reasons.join(" ")).toMatch(/文書内容|content_quality|empty/);
  });

  it("scenario7b: quality gate rejects headings-only before conversion", async () => {
    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成",
        finalDeliverable: "# 題名だけ\n## 見出し\n### 小見出し\n",
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId: "job_quality_headings" },
    );
    expect(result.deliverables).toHaveLength(0);
    expect(result.failures[0]?.reasons.join(" ")).toMatch(
      /content_quality|文書内容/,
    );
  });

  it("fault: packer exception surfaces as word convert failure", async () => {
    injectWordFault("docx_packer", 2);

    const result = await generateDeliverables(
      {
        assignment: "Word作成",
        finalDeliverable: SALES_REPORT,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId: "job_packer_fail" },
    );
    expect(result.deliverables.filter((d) => d.format === "docx")).toHaveLength(0);
    expect(result.failures.some((f) => f.format === "docx")).toBe(true);
  });

  it("scenario8: same jobId does not double-complete", async () => {
    const jobId = "job_dedupe_8";
    const first = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成してください",
        finalDeliverable: SALES_REPORT,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId },
    );
    const firstDocx = first.deliverables.find((d) => d.format === "docx");
    expect(firstDocx).toBeTruthy();

    const second = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成してください",
        finalDeliverable: SALES_REPORT,
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, jobId },
    );
    const secondDocx = second.deliverables.find((d) => d.format === "docx");
    expect(secondDocx?.id).toBe(firstDocx!.id);

    notifyWorkCompleted(OWNER, {
      title: "完了",
      message: "完了",
      deliverableId: firstDocx!.id,
      requestId: jobId,
    });
    notifyWorkCompleted(OWNER, {
      title: "完了",
      message: "完了",
      deliverableId: firstDocx!.id,
      requestId: jobId,
    });
    const notes = listStoredNotifications({ userId: OWNER }).filter(
      (n) => n.requestId === jobId,
    );
    expect(notes).toHaveLength(1);
  });

  it("scenario10: auth — owner 200, anon 401, other 404", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT,
      "営業報告書",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_REPORT,
      baseFileName: "営業報告書",
    });

    authMock.mockResolvedValue({ userId: OWNER });
    const ok = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(ok.status).toBe(200);

    authMock.mockResolvedValue({ userId: null });
    const unauth = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(unauth.status).toBe(401);
    const unauthBody = await unauth.json();
    expect(JSON.stringify(unauthBody)).not.toContain(stored.fileName);

    authMock.mockResolvedValue({ userId: OTHER });
    const other = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(other.status).toBe(404);
    const otherBody = await other.json();
    expect(JSON.stringify(otherBody)).not.toContain(stored.fileName);
    expect(JSON.stringify(otherBody)).not.toContain(String(stored.buffer.byteLength));
  });
  it("integrity helpers: sha256 stable", () => {
    const buf = Buffer.from("hello-atlas-word");
    expect(sha256Hex(buf)).toBe(
      createHash("sha256").update(buf).digest("hex"),
    );
  });
});
