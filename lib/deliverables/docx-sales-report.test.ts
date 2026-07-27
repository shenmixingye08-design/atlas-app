import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { GET } from "@/app/api/deliverables/[id]/route";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { verifyGeneratedExport } from "@/lib/deliverables/export-verify";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";
import {
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
  toDeliverableMetadata,
} from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { DELIVERABLE_MIME_TYPES } from "@/lib/deliverables/types";
import {
  listDocxStageLogs,
  resetDocxStageLogsForTests,
} from "@/lib/deliverables/docx-stage-log";

const OWNER = "docx_sales_owner";
const OTHER = "docx_sales_other";
const OUT = "/opt/cursor/artifacts/docx-sales-report";

export const SALES_REPORT_BODY = `# 営業報告書

## 概要

本日は栃木県内の太陽光発電予定地を訪問しました。

## 対応内容

・地権者への説明
・現地写真撮影
・測量範囲確認

## 今後

1.見積作成
2.関係者連絡
3.次回訪問
`;

describe("Word (.docx) sales report pipeline", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ userId: OWNER });
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetDocxStageLogsForTests();
    mkdirSync(OUT, { recursive: true });
  });

  it("parses Japanese bullets and numbered lists without spaces", () => {
    const parsed = parseDeliverableContent(SALES_REPORT_BODY);
    expect(parsed.title).toBe("営業報告書");
    expect(parsed.sections.some((s) => s.title === "概要")).toBe(true);

    const bullet = parsed.sections
      .flatMap((s) => s.blocks)
      .find((b) => b.type === "bulletList");
    expect(bullet?.type).toBe("bulletList");
    if (bullet?.type === "bulletList") {
      expect(bullet.items).toEqual([
        "地権者への説明",
        "現地写真撮影",
        "測量範囲確認",
      ]);
    }

    const numbered = parsed.sections
      .flatMap((s) => s.blocks)
      .find((b) => b.type === "numberedList");
    expect(numbered?.type).toBe("numberedList");
    if (numbered?.type === "numberedList") {
      expect(numbered.items).toEqual([
        "見積作成",
        "関係者連絡",
        "次回訪問",
      ]);
    }
  });

  it("generates a valid Word file (≥1500 bytes, PK, openable, Japanese)", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT_BODY,
      "営業報告書",
    );

    expect(generated.fileName).toBe("営業報告書.docx");
    expect(generated.mimeType).toBe(DELIVERABLE_MIME_TYPES.docx);
    expect(generated.buffer.byteLength).toBeGreaterThanOrEqual(1_500);
    expect(generated.buffer.subarray(0, 2).toString("latin1")).toBe("PK");

    const verified = verifyGeneratedExport(generated);
    expect(verified.ok).toBe(true);

    const path = join(OUT, "sales-report.docx");
    writeFileSync(path, generated.buffer);
    const listing = execFileSync("unzip", ["-l", path]).toString();
    expect(listing).toContain("word/document.xml");
    expect(listing).toContain("[Content_Types].xml");

    execFileSync("unzip", ["-o", path, "-d", join(OUT, "unzipped")]);
    const docXml = readFileSync(
      join(OUT, "unzipped", "word", "document.xml"),
      "utf8",
    );
    expect(docXml).toContain("w:document");
    expect(docXml).toMatch(/営業報告書|栃木|太陽光発電/);
    // Headings present
    expect(docXml).toMatch(/概要|対応内容|今後/);
    // Bullet / numbered content present
    expect(docXml).toContain("地権者への説明");
    expect(docXml).toContain("見積作成");

    const stages = listDocxStageLogs(20).map((e) => e.stage);
    expect(stages).toContain("DOCX_PARSE_STARTED");
    expect(stages).toContain("DOCX_PARSE_COMPLETED");
    expect(stages).toContain("DOCX_PACK_STARTED");
    expect(stages).toContain("DOCX_PACK_COMPLETED");
  });

  it("saves and downloads with correct headers (auth + MIME + disposition)", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT_BODY,
      "営業報告書",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_REPORT_BODY,
      baseFileName: "営業報告書",
    });
    const meta = toDeliverableMetadata(stored);
    expect(meta.downloadUrl).toBe(`/api/deliverables/${stored.id}`);

    const response = await GET(new Request(`http://localhost${meta.downloadUrl}`), {
      params: Promise.resolve({ id: stored.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("Content-Type")).not.toBe("application/json");
    expect(response.headers.get("Content-Type")).not.toBe("text/html");
    expect(response.headers.get("Content-Type")).not.toBe("text/plain");
    const cd = response.headers.get("Content-Disposition") ?? "";
    expect(cd.startsWith("attachment;")).toBe(true);
    expect(cd).toContain(".docx");
    expect(cd).toMatch(/filename\*=UTF-8''/);

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.byteLength).toBeGreaterThanOrEqual(1_500);
    expect(body.byteLength).toBe(stored.buffer.byteLength);
    expect(body.subarray(0, 2).toString("latin1")).toBe("PK");
    // Not JSON / HTML
    expect(body[0]).not.toBe(0x7b);
    expect(body[0]).not.toBe(0x3c);

    writeFileSync(join(OUT, "downloaded.docx"), body);
  });

  it("engine completes generate → verify → store for docx only", async () => {
    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成してください",
        finalDeliverable: SALES_REPORT_BODY,
        title: "営業報告書",
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER, workflowId: "wf_sales_1" },
    );

    expect(result.failures).toEqual([]);
    expect(result.deliverables).toHaveLength(1);
    expect(result.deliverables[0]?.format).toBe("docx");
    expect(result.deliverables[0]?.sizeBytes).toBeGreaterThanOrEqual(1_500);

    const stages = listDocxStageLogs(30).map((e) => e.stage);
    expect(stages).toContain("DOCX_VERIFY_STARTED");
    expect(stages).toContain("DOCX_VERIFY_COMPLETED");
    expect(stages).toContain("DOCX_STORE_STARTED");
    expect(stages).toContain("DOCX_STORE_COMPLETED");
    expect(stages).toContain("DOCX_METADATA_CREATED");
    expect(stages).toContain("DOCX_DOWNLOAD_READY");
  });

  it("rejects empty content", async () => {
    const result = await generateDeliverables(
      {
        assignment: "空",
        finalDeliverable: "   ",
        formats: ["docx"],
      },
      "http://localhost",
      { userId: OWNER },
    );
    expect(result.deliverables).toHaveLength(0);
    expect(result.failures[0]?.reasons).toContain("empty_deliverable");
  });

  it("rejects other-user download", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT_BODY,
      "営業報告書",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_REPORT_BODY,
      baseFileName: "営業報告書",
    });

    authMock.mockResolvedValue({ userId: OTHER });
    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBeTruthy();
  });

  it("rejects unauthenticated download", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT_BODY,
      "営業報告書",
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: SALES_REPORT_BODY,
      baseFileName: "営業報告書",
    });

    authMock.mockResolvedValue({ userId: null });
    const response = await GET(
      new Request(`http://localhost/api/deliverables/${stored.id}`),
      { params: Promise.resolve({ id: stored.id }) },
    );
    expect(response.status).toBe(401);
  });

  it("labels store failure separately from generation failure", async () => {
    const generated = await new DocxDeliverableGenerator().generate(
      SALES_REPORT_BODY,
      "営業報告書",
    );
    expect(generated.buffer.byteLength).toBeGreaterThanOrEqual(1_500);

    await expect(
      saveDeliverableFileDurable(generated, "", {
        sourceContent: SALES_REPORT_BODY,
        baseFileName: "営業報告書",
      }),
    ).rejects.toThrow(/userId/i);

    const store = await import("@/lib/deliverables/store");
    const spy = vi
      .spyOn(store, "saveDeliverableFileDurable")
      .mockRejectedValueOnce(new Error("disk_unavailable"));

    const result = await generateDeliverables(
      {
        assignment: "営業報告書をWordで作成してください",
        finalDeliverable: SALES_REPORT_BODY,
        title: "営業報告書",
        formats: ["docx"],
      },
      "http://localhost",
      {
        userId: OWNER,
        jobId: "job_store_fail",
        workflowId: "wf_store_fail",
      },
    );

    spy.mockRestore();
    expect(result.deliverables).toHaveLength(0);
    expect(
      result.failures?.some((f) =>
        f.reasons.some((r) => r.includes("Word生成成功・保存失敗")),
      ),
    ).toBe(true);
    expect(
      result.failures?.some((f) =>
        f.reasons.some((r) => r.startsWith("Word生成失敗")),
      ),
    ).toBe(false);
  });

  it("supports tables in Word generation", async () => {
    const withTable = `${SALES_REPORT_BODY}

## 表

| 項目 | 内容 |
| --- | --- |
| 場所 | 栃木 |
| 種別 | 太陽光 |
`;
    const generated = await new DocxDeliverableGenerator().generate(
      withTable,
      "営業報告書_表",
    );
    expect(verifyGeneratedExport(generated).ok).toBe(true);
    const path = join(OUT, "with-table.docx");
    writeFileSync(path, generated.buffer);
    execFileSync("unzip", ["-o", path, "-d", join(OUT, "table-unzipped")]);
    const docXml = readFileSync(
      join(OUT, "table-unzipped", "word", "document.xml"),
      "utf8",
    );
    expect(docXml).toContain("w:tbl");
    expect(existsSync(join(OUT, "table-unzipped", "word", "document.xml"))).toBe(
      true,
    );
  });
});
