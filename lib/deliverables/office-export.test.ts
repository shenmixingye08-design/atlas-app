import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

import { assertNonEmptyFile, exportOfficeDeliverable } from "./export-file";
import { buildContentDisposition } from "./http-headers";
import { DocxDeliverableGenerator } from "./generators/docx-generator";
import { PdfDeliverableGenerator } from "./generators/pdf-generator";

const OUT_DIR = join(process.cwd(), ".tmp/office-export-tests");

const PLAIN_JP = `# 日本語本文テスト

これは日本語だけの成果物です。MINERVOTが生成した内容をそのまま納品します。
`;

const HEADINGS_BULLETS = `# 提案書

## 背景
市場環境が変化しています。

## 方針
- 顧客課題を明確化する
- 導入効果を定量で示す
- 次のアクションを合意する
`;

const WITH_TABLE = `# 売上レポート

## 実績一覧

| 月 | 売上 | 備考 |
| --- | --- | --- |
| 1月 | 1200000 | 好調 |
| 2月 | 980000 | 季節要因 |
| 3月 | 1450000 | キャンペーン |
`;

describe("Content-Disposition", () => {
  it("encodes Japanese filenames with filename*", () => {
    const header = buildContentDisposition("提案書.docx");
    expect(header).toContain("filename=");
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent("提案書.docx"));
  });
});

describe("Word (.docx) generation", () => {
  it("generates Japanese body-only docx > 0KB with OOXML signature", async () => {
    const file = await new DocxDeliverableGenerator().generate(
      PLAIN_JP,
      "日本語本文",
    );
    assertNonEmptyFile(file, "docx");
    expect(file.format).toBe("docx");
    expect(file.mimeType).toContain("wordprocessingml");
    expect(file.buffer[0]).toBe(0x50);
    expect(file.buffer[1]).toBe(0x4b);
    expect(file.buffer.byteLength).toBeGreaterThan(1000);
  });

  it("generates headings and bullets", async () => {
    const file = await exportOfficeDeliverable({
      format: "docx",
      content: HEADINGS_BULLETS,
      title: "提案書",
    });
    assertNonEmptyFile(file, "docx");
    expect(file.fileName.endsWith(".docx")).toBe(true);
  });

  it("generates tables", async () => {
    const file = await exportOfficeDeliverable({
      format: "docx",
      content: WITH_TABLE,
      assignment: "売上レポートを作って",
    });
    assertNonEmptyFile(file, "docx");
  });
});

describe("PDF (.pdf) generation", () => {
  it("generates Japanese body-only searchable pdf > 0KB", async () => {
    const file = await new PdfDeliverableGenerator().generate(
      PLAIN_JP,
      "日本語本文",
    );
    assertNonEmptyFile(file, "pdf");
    expect(file.format).toBe("pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(file.buffer.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    expect(file.buffer.byteLength).toBeGreaterThan(1000);
  });

  it("generates headings and tables", async () => {
    const file = await exportOfficeDeliverable({
      format: "pdf",
      content: WITH_TABLE,
      title: "売上レポート",
    });
    assertNonEmptyFile(file, "pdf");
    expect(file.fileName.endsWith(".pdf")).toBe(true);
  });
});

describe("write sample files for manual open checks", () => {
  it("writes docx and pdf artifacts under .tmp", async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const docx = await exportOfficeDeliverable({
      format: "docx",
      content: WITH_TABLE,
      title: "手動確認用",
    });
    const pdf = await exportOfficeDeliverable({
      format: "pdf",
      content: WITH_TABLE,
      title: "手動確認用",
    });

    const docxPath = join(OUT_DIR, "sample.docx");
    const pdfPath = join(OUT_DIR, "sample.pdf");
    writeFileSync(docxPath, docx.buffer);
    writeFileSync(pdfPath, pdf.buffer);

    expect(readFileSync(docxPath).byteLength).toBeGreaterThan(1000);
    expect(readFileSync(pdfPath).byteLength).toBeGreaterThan(1000);
    expect(readFileSync(pdfPath).subarray(0, 4).toString("utf-8")).toBe("%PDF");
  });
});
