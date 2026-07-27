import { describe, expect, it, beforeEach } from "vitest";

import {
  assertExportPathHasNoAiRegenerate,
  resolveAiExportRetryMode,
  shouldAllowAiContentRetry,
} from "@/lib/deliverables/ai-export-policy";
import { applyDeterministicStructureRepair } from "@/lib/deliverables/deterministic-repair";
import {
  buildExportCacheKey,
  getExportCacheEntry,
  resetExportCacheForTests,
  setExportCacheEntry,
} from "@/lib/deliverables/export-cache";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import {
  detectWordPurpose,
  listWordTemplates,
  WORD_TEMPLATE_IDS,
} from "@/lib/deliverables/word-templates";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";

describe("quality without extra AI", () => {
  beforeEach(() => {
    resetExportCacheForTests();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
  });

  it("lists contract and estimate templates", () => {
    expect(WORD_TEMPLATE_IDS).toContain("contract");
    expect(WORD_TEMPLATE_IDS).toContain("estimate");
    expect(listWordTemplates().length).toBe(10);
  });

  it("detects contract and estimate without AI", () => {
    expect(
      detectWordPurpose({ assignment: "契約書のたたき台をWordで作って" })
        .templateId,
    ).toBe("contract");
    expect(
      detectWordPurpose({ assignment: "お見積書をWordで作成して" }).templateId,
    ).toBe("estimate");
    expect(
      detectWordPurpose({ assignment: "3社の見積比較資料を作って" }).templateId,
    ).toBe("comparison-table");
  });

  it("parses Japanese bullets and markdown tables with separators", () => {
    const parsed = parseDeliverableContent(`# 題

## 要点
・確認する
●実施する
＊共有する
- 通常箇条

## 表
| 項目 | 金額 |
| --- | --- |
| A | 1000円 |
| B | 2000円 |
`);
    const allBlocks = [
      ...parsed.sections.flatMap((s) => s.blocks),
    ];
    const bullets = allBlocks.filter((b) => b.type === "bulletList");
    expect(bullets.length).toBeGreaterThan(0);
    const items = bullets.flatMap((b) =>
      b.type === "bulletList" ? b.items : [],
    );
    expect(items.join(",")).toContain("確認");
    expect(items.join(",")).toContain("通常箇条");
    const tables = allBlocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(1);
    if (tables[0]?.type === "table") {
      expect(tables[0].rows).toHaveLength(2);
      expect(tables[0].headers.join(",")).not.toContain("---");
    }
  });

  it("repairs missing sections with 要確認 placeholders (no invented facts)", () => {
    const repaired = applyDeterministicStructureRepair({
      content: "# 営業報告\n\n## 概要\n訪問しました。\n",
      assignment: "今日の訪問内容を営業報告書にして",
    });
    expect(repaired.templateId).toBe("sales-report");
    expect(repaired.addedSections.length).toBeGreaterThan(0);
    expect(repaired.content).toContain("要確認");
    expect(repaired.content).not.toMatch(/株式会社架空|山田太郎様|1,234,567円/);
  });

  it("forbids AI regenerate on export path by default", () => {
    expect(
      resolveAiExportRetryMode({
        allowAiContentRetry: false,
        regenerateProvided: true,
      }),
    ).toBe("never");
    expect(
      shouldAllowAiContentRetry({
        mode: "never",
        issues: ["empty"],
      }),
    ).toBe(false);
    expect(() =>
      assertExportPathHasNoAiRegenerate(() => Promise.resolve("x")),
    ).toThrow(/export_path_ai_regenerate_forbidden/);
  });

  it("reuses export cache for identical content+template (0 re-render)", async () => {
    const content = `# 提案

## 課題
お客様の現状課題を整理し、業務負荷と属人化のリスクを明確にします。

## 提案内容
テンプレートとレイアウト改善により、追加のAI呼び出しなしで提出品質を高めます。

## 次のステップ
関係者レビューのうえ、来週の定例で合意形成を進めます。
`;
    const gen = new DocxDeliverableGenerator();
    const first = await gen.generate(content, "提案書", {
      assignment: "提案書をWordで",
      templateId: "proposal",
    });
    const key = buildExportCacheKey({
      content,
      format: "docx",
      templateId: "proposal",
      baseFileName: "提案書",
    });
    setExportCacheEntry({
      key,
      format: "docx",
      buffer: first.buffer,
      fileName: first.fileName,
      mimeType: first.mimeType,
      contentSha256: "abc",
      createdAt: Date.now(),
    });
    expect(getExportCacheEntry(key)?.buffer.byteLength).toBe(first.buffer.byteLength);

    let aiCalls = 0;
    const result = await generateDeliverables(
      {
        assignment: "提案書をWordで",
        finalDeliverable: content,
        formats: ["docx"],
        title: "提案書",
      },
      "http://localhost",
      {
        userId: "cache_user",
        jobId: `job_cache_${Date.now()}`,
        templateId: "proposal",
        allowAiContentRetry: false,
        regenerateContent: async () => {
          aiCalls += 1;
          return content;
        },
      },
    );
    expect(aiCalls).toBe(0);
    if (result.deliverables.length === 0) {
      // Make failure reason visible for debugging without AI.
      expect(result.failures).toEqual([]);
    }
    expect(result.deliverables.length).toBe(1);
    expect(result.failures).toHaveLength(0);
  });

  it("renders PDF tables and PPTX stays pptx format", async () => {
    const content = `# 比較

## 明細
| 項目 | 金額 |
| --- | --- |
| 設計 | 100000円 |
| 工事 | 200000円 |
`;
    const pdf = await new PdfDeliverableGenerator().generate(content, "比較");
    expect(pdf.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdf.buffer.byteLength).toBeGreaterThan(1000);

    const pptx = await new PptxDeliverableGenerator().generate(content, "比較");
    expect(pptx.format).toBe("pptx");
    expect(pptx.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(pptx.mimeType).toContain("presentationml");
  });
});
