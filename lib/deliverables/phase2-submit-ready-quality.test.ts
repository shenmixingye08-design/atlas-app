/**
 * Phase 2 deliverable quality: generate → save → reload → gate.
 * Real generators, not mock bytes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDeliverableGenerator } from "@/lib/deliverables/generators";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { verifyDocxDocument } from "@/lib/deliverables/document-model/verify-docx";
import { inspectXlsxWorkbook } from "@/lib/deliverables/excel-workbook/verify";
import { verifyPptxDeck } from "@/lib/deliverables/pptx-storyboard/verify";
import { saveDeliverableArtifact } from "@/lib/deliverables/artifact-persist";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetMemoryDurableStorageForTests } from "@/lib/deliverables/memory-durable-storage";
import { validateDeliverableSourceContent } from "@/lib/deliverables/content-quality";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import type { VisionBatchResult } from "@/lib/vision/types";
import type { DeliverableFormat, GeneratedDeliverableFile } from "@/lib/deliverables/types";

const OWNER = "user_phase2_deliverable";

const REPORT = `# 週次社内報告書

## 今週の要点
重点案件は計画どおり進んでいます。売上は前年比で増加しています。

## 実績
受注は12件でした。新規は4件です。既存顧客の継続も安定しています。

## 今後の対応
来週までに採用計画を確定し、フォローアップを実施します。
`;

const LEDGER = `# 今月の収支

| 日付 | 項目 | 金額 |
| --- | --- | ---: |
| 2026-08-01 | 売上 | 120000 |
| 2026-08-10 | 仕入 | 45000 |
| 2026-08-20 | 経費 | 18000 |
`;

const DECK = `# 導入ご提案

## 課題
手作業の転記が続いています。

## 提案
一度頼んだ仕事を次から自動で終わらせます。

## 次のアクション
- デモを実施する
- 試験導入する
`;

async function generate(format: DeliverableFormat, content: string) {
  const gen = getDeliverableGenerator(format);
  expect(gen).toBeTruthy();
  return gen!.generate(content, `phase2-${format}`);
}

async function saveAndReload(file: GeneratedDeliverableFile) {
  const { stored } = await saveDeliverableArtifact({
    file,
    ownerId: OWNER,
    sourceContent: "phase2",
  });
  const reloaded = await getStoredDeliverableForUser(stored.id, OWNER);
  expect(reloaded).toBeTruthy();
  return reloaded!;
}

describe("Phase 2 submit-ready deliverables", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_DELIVERABLE_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    resetMemoryDurableStorageForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Scenario A: 社内報告書 → Word / PDF survive reload quality gates", async () => {
    for (const format of ["docx", "pdf"] as const) {
      const file = await generate(format, REPORT);
      expect(file.buffer.byteLength).toBeGreaterThan(0);
      const generated = await verifyGeneratedExportAsync(file);
      expect(generated.ok, generated.reasons.join(",")).toBe(true);

      const stored = await saveAndReload(file);
      const reloaded = await verifyGeneratedExportAsync({
        format: stored.format,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        buffer: stored.buffer,
        isPlaceholder: stored.isPlaceholder,
      });
      expect(reloaded.ok, reloaded.reasons.join(",")).toBe(true);
      if (format === "docx") {
        const docx = await verifyDocxDocument(stored.buffer);
        expect(docx.headingCount).toBeGreaterThanOrEqual(2);
        expect(docx.paragraphCount).toBeGreaterThan(3);
        expect(docx.reasons).not.toContain("placeholder_leak");
        expect(docx.reasons).not.toContain("undefined_leak");
      }
    }
  });

  it("Scenario B: 収支一覧 → Excel has header, filter, freeze, and formulas when addable", async () => {
    const file = await generate("xlsx", LEDGER);
    const stored = await saveAndReload(file);
    const inspect = await inspectXlsxWorkbook(stored.buffer);
    expect(inspect.verify.ok, inspect.verify.reasons.join(",")).toBe(true);
    expect(inspect.verify.hasFilter).toBe(true);
    expect(inspect.verify.hasFreeze).toBe(true);
    const sheet = inspect.sheets[0];
    expect(sheet).toBeTruthy();
    expect(sheet!.headers.join("")).toMatch(/日付|項目|金額/);
    expect(sheet!.rowCount).toBeGreaterThan(2);
  });

  it("Scenario C: 提案資料 → PowerPoint is not a text dump", async () => {
    const file = await generate("pptx", DECK);
    const stored = await saveAndReload(file);
    const pptx = await verifyPptxDeck(stored.buffer);
    expect(pptx.ok, pptx.reasons.join(",")).toBe(true);
    expect(pptx.slideCount).toBeGreaterThanOrEqual(2);
    expect(pptx.titles.some((title) => title.trim().length > 0)).toBe(true);
    expect(pptx.reasons).not.toContain("overflow_risk");
  });

  it("rejects placeholder / undefined / empty source before conversion", () => {
    const empty = validateDeliverableSourceContent("", ["docx"]);
    expect(empty.ok).toBe(false);
    const todo = validateDeliverableSourceContent(
      "# 題\n\n[TODO] 本文を書く\n\nこれは提出できません。",
      ["docx"],
    );
    expect(todo.ok).toBe(false);
    const leaked = validateDeliverableSourceContent(
      "# 題\n\n値は undefined です。提出できません。",
      ["docx"],
    );
    expect(leaked.ok).toBe(false);
    const ok = validateDeliverableSourceContent(REPORT, ["docx", "pdf"]);
    expect(ok.ok).toBe(true);
  });

  it("Vision invoice low-confidence cells stay 要確認 and do not invent numbers", () => {
    const batch = {
      id: "vision_phase2",
      images: [
        {
          detectedType: "invoice",
          confidence: 0.2,
          extractedText: "",
          summary: "",
          fields: {
            issuer: "",
            lineItems: [
              { name: "", quantity: "", unitPrice: "", amount: "", notes: "" },
            ],
          },
          tables: [],
          warnings: [],
        },
      ],
      commonFields: { detectedType: "invoice" },
      mergedTables: [],
      warnings: [],
      recommendedArtifactType: "invoice_excel",
    } as unknown as VisionBatchResult;
    const markdown = visionBatchToDeliverableContent(batch);
    expect(markdown).toContain("要確認");
    expect(markdown).not.toMatch(/¥\s*999999|勝手に作った/);
  });
});
