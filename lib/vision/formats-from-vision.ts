import type { DeliverableFormat } from "@/lib/deliverables/types";
import type { VisionBatchResult, VisionDetectedType } from "@/lib/vision/types";

/**
 * Map vision understanding → deliverable formats (no Planner core changes).
 * Prefer a single primary format; add PDF only when the user explicitly asks
 * (cost + reliability — secretary finishes the main file first).
 */
export function formatsFromVisionBatch(
  batch: VisionBatchResult,
  assignment = "",
): DeliverableFormat[] {
  const type =
    (batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    batch.images[0]?.detectedType ??
    "unknown";
  const recommended = batch.recommendedArtifactType;
  const text = assignment;
  const wantsPdf = /PDF|pdf/i.test(text);
  const wantsWord = /Word|ワード|docx/i.test(text);
  const wantsExcel = /Excel|エクセル|xlsx|家計簿/i.test(text);

  if (
    recommended === "household_excel" ||
    recommended === "invoice_excel" ||
    recommended === "table_excel" ||
    type === "receipt" ||
    type === "invoice" ||
    type === "table" ||
    type === "spreadsheet_source" ||
    (wantsExcel && !wantsWord)
  ) {
    return wantsPdf ? ["xlsx", "pdf"] : ["xlsx"];
  }

  if (
    recommended === "contract_docx" ||
    recommended === "chart_report_docx" ||
    recommended === "improved_sales_doc" ||
    recommended === "memo_text" ||
    recommended === "screenshot_summary_docx" ||
    recommended === "photo_report_docx" ||
    type === "contract" ||
    type === "chart" ||
    type === "handwritten_note" ||
    type === "sales_material" ||
    type === "screenshot" ||
    wantsWord
  ) {
    return wantsPdf ? ["docx", "pdf"] : ["docx"];
  }

  if (type === "business_card" || recommended === "contact_card") {
    return ["docx"];
  }

  return wantsPdf ? ["docx", "pdf"] : ["docx"];
}

export function titleFromVisionBatch(batch: VisionBatchResult): string {
  const type =
    (batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    batch.images[0]?.detectedType ??
    "unknown";
  const map: Partial<Record<VisionDetectedType, string>> = {
    receipt: "家計簿（レシート）",
    invoice: "請求書データ",
    contract: "契約書要約",
    chart: "グラフ分析レポート",
    table: "表データ",
    spreadsheet_source: "表データ",
    handwritten_note: "手書きメモ整理",
    business_card: "名刺情報",
    sales_material: "営業資料改善案",
    screenshot: "画面キャプチャ整理",
    general_photo: "写真レポート",
    property_photo: "物件写真レポート",
    equipment_photo: "設備写真レポート",
  };
  return map[type] ?? "画像解析レポート";
}
