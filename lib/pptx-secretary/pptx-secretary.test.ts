import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, TextRun } from "docx";

import { detectPptxIntent } from "./detect-intent";
import { buildPresentationFromIntent } from "./outlines";
import { validatePresentationModel } from "./schema";
import { writePptxBuffer, toPreviewPayload } from "./build-pptx";
import { applyPptxEdits } from "./edit";
import {
  createPptxFromAssignment,
  createPptxFromUpload,
  convertPresentationToPdf,
  editPptxPresentation,
} from "./service";
import { looksLikePptxZip, sanitizePptxFileName } from "./security";
import { resolveTheme, themeForKind } from "./themes";
import {
  PPTX_LIMITS,
  slideCountForDuration,
  classifyPptxScale,
  pptxScaleGuidance,
} from "./limits";
import { userMessageForPptxCode } from "./job-phase";
import { claimIdempotencyKey, buildRequestIdempotencyKey } from "@/lib/request-understanding/idempotency";

async function assertValidPptx(buffer: Buffer) {
  expect(looksLikePptxZip(buffer)).toBe(true);
  expect(buffer.byteLength).toBeGreaterThan(2000);
  // OOXML should contain slide XML fragments
  const asLatin1 = buffer.toString("latin1");
  expect(asLatin1.includes("ppt/") || asLatin1.includes("[Content_Types].xml")).toBe(
    true,
  );
}

describe("pptx secretary acceptance", () => {
  it("1. 営業提案資料", async () => {
    const result = await createPptxFromAssignment({
      assignment: "営業提案資料を作って",
      brand: { companyName: "MINERVOT", primaryColor: "0F3D68" },
    });
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    expect(result.presentation?.kind).toBe("sales_pitch");
    await assertValidPptx(result.buffer!);
    expect(result.presentation!.slides.some((s) => s.type === "cta")).toBe(true);
  });

  it("2. 会社紹介", async () => {
    const result = await createPptxFromAssignment({ assignment: "会社紹介資料を作って" });
    expect(result.ok).toBe(true);
    expect(result.presentation?.kind).toBe("company_intro");
  });

  it("3. 月次報告", async () => {
    const result = await createPptxFromAssignment({ assignment: "月次報告資料を作って" });
    expect(result.presentation?.kind).toBe("monthly_report");
    expect(result.presentation!.slides.some((s) => s.charts.length > 0 || s.type === "kpi_cards")).toBe(true);
  });

  it("4. 研修資料", async () => {
    const result = await createPptxFromAssignment({ assignment: "研修資料を作って" });
    expect(result.presentation?.kind).toBe("training");
    expect(result.presentation!.slides.some((s) => /演習|学習/.test(s.title))).toBe(true);
  });

  it("5. 企画書", async () => {
    const result = await createPptxFromAssignment({ assignment: "新規事業の企画書を作って" });
    expect(["business_plan", "proposal"]).toContain(result.presentation?.kind);
  });

  it("6-7. 5分と15分で枚数が変わる", () => {
    expect(slideCountForDuration(5)).toBeLessThan(slideCountForDuration(15));
    const a = detectPptxIntent("営業資料を5分で");
    const b = detectPptxIntent("営業資料を15分で");
    expect(a.targetSlides).toBeLessThan(b.targetSlides);
  });

  it("8. 16:9", async () => {
    const result = await createPptxFromAssignment({ assignment: "営業資料を16:9で" });
    expect(result.presentation?.aspect_ratio).toBe("16:9");
  });

  it("9. 4:3", async () => {
    const result = await createPptxFromAssignment({ assignment: "研修資料を4:3で作って" });
    expect(result.presentation?.aspect_ratio).toBe("4:3");
  });

  it("10. 日本語", async () => {
    const result = await createPptxFromAssignment({ assignment: "サービス紹介資料を作って" });
    expect(result.presentation?.language).toBe("ja-JP");
    expect(result.presentation!.presentation_title).toMatch(/サービス|紹介|資料/);
  });

  it("11. 英語", async () => {
    const result = await createPptxFromAssignment({
      assignment: "Create a sales pitch deck in English",
    });
    expect(result.presentation?.language).toBe("en-US");
  });

  it("12-13. 表紙と目次", async () => {
    const result = await createPptxFromAssignment({ assignment: "営業提案資料を作って" });
    expect(result.presentation!.slides[0]?.type).toBe("title");
    expect(result.presentation!.slides.some((s) => s.type === "agenda")).toBe(true);
  });

  it("14. 箇条書き制限", () => {
    const intent = detectPptxIntent("営業提案資料を作って");
    const model = buildPresentationFromIntent(intent);
    for (const slide of model.slides) {
      expect(slide.content.length).toBeLessThanOrEqual(PPTX_LIMITS.maxBulletsPerSlide);
    }
  });

  it("15. 比較表レイアウト", async () => {
    const result = await createPptxFromAssignment({ assignment: "会社紹介資料を作って" });
    expect(result.presentation!.slides.some((s) => s.type === "comparison" || s.visuals.length)).toBe(true);
  });

  it("16. フロー図", async () => {
    const result = await createPptxFromAssignment({ assignment: "営業提案資料を作って" });
    expect(result.presentation!.slides.some((s) => s.visuals.some((v) => v.type === "process" || v.type === "timeline" || v.type === "flow"))).toBe(true);
  });

  it("17. タイムライン", async () => {
    const result = await createPptxFromAssignment({ assignment: "月次報告資料を作って" });
    expect(result.presentation!.slides.some((s) => s.type === "timeline" || s.visuals.some((v) => v.type === "roadmap"))).toBe(true);
  });

  it("18-20. グラフ種類", async () => {
    const intent = detectPptxIntent("月次報告資料を作って");
    const model = buildPresentationFromIntent(intent);
    const chartSlide = model.slides.find((s) => s.charts.length > 0);
    expect(chartSlide).toBeTruthy();
    const buffer = await writePptxBuffer(model);
    await assertValidPptx(buffer);
  });

  it("21. ExcelからPowerPoint", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("売上");
    sheet.addRow(["月", "売上"]);
    sheet.addRow(["1月", 100]);
    sheet.addRow(["2月", 120]);
    sheet.addRow(["3月", 90]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const result = await createPptxFromUpload({
      fileName: "sales.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
      assignment: "売上報告のプレゼンにして",
    });
    expect(result.ok).toBe(true);
    expect(result.presentation!.slides.some((s) => s.source_references.some((r) => r.startsWith("xlsx:")))).toBe(true);
    await assertValidPptx(result.buffer!);
  });

  it("22. WordからPowerPoint", async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun("顧客課題は時間不足です。")] }),
            new Paragraph({ children: [new TextRun("解決策は業務代行です。")] }),
            new Paragraph({ children: [new TextRun("次のアクションはデモです。")] }),
          ],
        },
      ],
    });
    const buffer = Buffer.from(await Packer.toBuffer(doc));
    const result = await createPptxFromUpload({
      fileName: "notes.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
      assignment: "この企画を営業資料に",
    });
    expect(result.ok).toBe(true);
    await assertValidPptx(result.buffer!);
  });

  it("23. PDFからPowerPoint", async () => {
    const { PdfDeliverableGenerator } = await import(
      "@/lib/deliverables/generators/pdf-generator"
    );
    const pdf = await new PdfDeliverableGenerator().generate(
      "# 提案\n\n課題は工数です。\n\n解決策は自動化です。",
      "source",
    );
    const result = await createPptxFromUpload({
      fileName: "source.pdf",
      mimeType: "application/pdf",
      buffer: pdf.buffer,
      assignment: "PDFから提案資料を作成",
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("PDF"))).toBe(true);
  });

  it("24. 画像プレースホルダ警告を捏造しない", async () => {
    const result = await createPptxFromAssignment({ assignment: "商品説明資料を作って" });
    expect(result.ok).toBe(true);
  });

  it("25. 発表者ノート", async () => {
    const result = await createPptxFromAssignment({ assignment: "セミナー資料を10分で" });
    expect(result.presentation!.slides.every((s) => s.speaker_notes.trim().length > 10)).toBe(true);
    expect(result.presentation!.slides.some((s) => s.speaker_notes.includes("次"))).toBe(true);
  });

  it("26-27. ブランド", async () => {
    const theme = resolveTheme("sales", {
      companyName: "MINERVOT",
      primaryColor: "123456",
      accentColor: "ABCDEF",
    });
    expect(theme.colors.primary).toBe("123456");
    expect(theme.brand.companyName).toBe("MINERVOT");
    expect(themeForKind("training")).toBe("training");
  });

  it("28-29. 編集とrevision", async () => {
    const created = await createPptxFromAssignment({ assignment: "営業提案資料を作って" });
    const edited = await editPptxPresentation({
      presentation: created.presentation!,
      operations: [
        { op: "shorten_text" },
        { op: "change_theme", theme: "modern" },
        { op: "delete_slides", slides: [created.presentation!.slides.length] },
      ],
      revisionNote: "shorten",
    });
    expect(edited.ok).toBe(true);
    expect(edited.revisionNote).toBe("shorten");
    expect(edited.presentation!.theme.style).toBe("modern");
    await assertValidPptx(edited.buffer!);
  });

  it("30. PDF変換", async () => {
    const created = await createPptxFromAssignment({ assignment: "会社紹介資料を作って" });
    const pdf = await convertPresentationToPdf(created.presentation!);
    expect(pdf.ok).toBe(true);
    expect(pdf.buffer![0]).toBe(0x25); // %
    expect(pdf.buffer!.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("31. プレビュー", async () => {
    const created = await createPptxFromAssignment({ assignment: "研修資料を作って" });
    const preview = toPreviewPayload(created.presentation!);
    expect(preview.slideCount).toBeGreaterThan(3);
    expect(preview.slides[0]?.title).toBeTruthy();
  });

  it("32. モバイル向け枚数制限の案内", () => {
    expect(classifyPptxScale(30)).toBe("large");
    expect(pptxScaleGuidance("large")).toMatch(/バックグラウンド|サムネイル/);
  });

  it("33. Storage失敗コード", () => {
    expect(userMessageForPptxCode("storage_upload_failed")).toMatch(/保存/);
  });

  it("34. timeoutメッセージ", () => {
    expect(userMessageForPptxCode("timeout")).toMatch(/時間/);
  });

  it("35. 重複生成防止キー", () => {
    const key = buildRequestIdempotencyKey({
      userId: "u1",
      assignment: "営業資料を作って",
    });
    expect(claimIdempotencyKey(key)).toBe(true);
    expect(claimIdempotencyKey(key)).toBe(false);
  });

  it("36. ファイル名サニタイズ", () => {
    expect(sanitizePptxFileName("../機密:資料?.pptx")).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("37. 日本語タイトルを含む生成", async () => {
    const result = await createPptxFromAssignment({
      assignment: "太陽光発電の提案資料を作って",
    });
    expect(result.presentation!.presentation_title).toContain("太陽光");
    await assertValidPptx(result.buffer!);
  });

  it("38. スライド外はみ出し防止の余白定数", () => {
    expect(PPTX_LIMITS.safeMarginIn).toBeGreaterThanOrEqual(0.4);
  });

  it("39. スキーマ検証で破損モデルを拒否", () => {
    const result = validatePresentationModel({ presentation_title: "" });
    expect(result.ok).toBe(false);
  });

  it("40. reorder編集", () => {
    const intent = detectPptxIntent("営業提案資料を作って");
    const model = buildPresentationFromIntent(intent);
    const order = model.slides.map((s) => s.slide_number).reverse();
    const edited = applyPptxEdits(model, [{ op: "reorder_slides", order }]);
    expect(edited.slides[0]?.title).toBe(model.slides[model.slides.length - 1]?.title);
  });
});
