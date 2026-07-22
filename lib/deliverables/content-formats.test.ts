import { describe, expect, it } from "vitest";

import {
  countMarkdownTables,
  enrichFormatsFromContent,
  looksLikePresentation,
  looksLikeSpreadsheet,
} from "./content-formats";
import { resolveGenerationFormats } from "./resolve-formats";

const TABLE_DOC = `# 売上管理

## 月次実績

| 月 | 売上 | 粗利 |
| --- | --- | --- |
| 2026/01/01 | 1,200,000 | 35% |
| 2026/02/01 | 1,450,000 | 38% |
| 2026/03/01 | 1,100,000 | 33% |
`;

const DECK_DOC = `# 提案資料

## 課題
課題を整理します。

## 解決策
解決策を提示します。

## 導入効果
効果を説明します。

## 次のステップ
次のアクションです。
`;

describe("content-formats", () => {
  it("counts markdown tables", () => {
    expect(countMarkdownTables(TABLE_DOC)).toBe(1);
  });

  it("detects spreadsheet-like content", () => {
    expect(looksLikeSpreadsheet(TABLE_DOC)).toBe(true);
  });

  it("detects presentation-like content", () => {
    expect(looksLikePresentation(DECK_DOC)).toBe(true);
  });

  it("enriches formats with excel/csv for tables", () => {
    const formats = enrichFormatsFromContent(["pdf"], TABLE_DOC, "売上管理");
    expect(formats).toContain("xlsx");
    expect(formats).toContain("csv");
    expect(formats).toContain("pdf");
  });
});

describe("resolveGenerationFormats + content", () => {
  it("keeps user override without content enrichment", () => {
    const result = resolveGenerationFormats("営業資料", ["md"], TABLE_DOC);
    expect(result.formats).toEqual(["md"]);
    expect(result.matchedRule).toBe("user_selected_formats");
  });

  it("auto-detects spreadsheet assignment", () => {
    const result = resolveGenerationFormats("売上管理表を作って");
    expect(result.formats).toContain("xlsx");
    expect(result.matchedRule).toBe("spreadsheet");
  });

  it("enriches deck detection with content", () => {
    const result = resolveGenerationFormats("企画書を作って", undefined, DECK_DOC);
    expect(result.formats).toContain("pptx");
  });
});
