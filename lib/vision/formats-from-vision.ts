import type { DeliverableFormat } from "@/lib/deliverables/types";
import type { WordTemplateId } from "@/lib/deliverables/word-templates";
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
  const fieldTitle =
    typeof batch.images[0]?.fields?.title === "string"
      ? batch.images[0].fields.title.trim()
      : "";
  if (fieldTitle) return fieldTitle.slice(0, 80);

  const map: Partial<Record<VisionDetectedType, string>> = {
    receipt: "家計簿（レシート）",
    invoice: "請求書データ",
    contract: "契約書要約",
    chart: "グラフ分析レポート",
    table: "表データ",
    spreadsheet_source: "表データ",
    handwritten_note: "手書きメモ整理",
    business_card: "名刺情報",
    sales_material: "営業資料",
    business_document: "業務資料",
    screenshot: "画面キャプチャ整理",
    general_photo: "写真レポート",
    property_photo: "物件写真レポート",
    equipment_photo: "設備写真レポート",
  };
  return map[type] ?? "資料";
}

/** Pick a Word template that matches the understood image type (no AI). */
export function wordTemplateFromVisionBatch(
  batch: VisionBatchResult,
  assignment = "",
): WordTemplateId {
  const type =
    (batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    batch.images[0]?.detectedType ??
    "unknown";
  if (/議事録|会議/.test(assignment)) return "meeting-minutes";
  if (/提案/.test(assignment) || type === "sales_material") return "proposal";
  if (/比較|見積/.test(assignment) || type === "table") return "comparison-table";
  if (type === "contract") return "customer-letter";
  if (type === "chart" || type === "business_document") return "business-report";
  if (type === "invoice" || type === "estimate") return "sales-report";
  return "standard-document";
}
