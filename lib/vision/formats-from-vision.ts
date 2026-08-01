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
  const wantsExcel = /Excel|エクセル|xlsx|家計簿|CSV|csv/i.test(text);
  const wantsPptx = /PowerPoint|パワポ|pptx|スライド/i.test(text);

  if (wantsPptx && (type === "chart" || type === "sales_material")) {
    return wantsPdf ? ["pptx", "pdf"] : ["pptx"];
  }

  if (
    recommended === "household_excel" ||
    recommended === "invoice_excel" ||
    recommended === "table_excel" ||
    recommended === "contact_list_excel" ||
    type === "receipt" ||
    type === "receipt_voucher" ||
    type === "invoice" ||
    type === "delivery_note" ||
    type === "table" ||
    type === "spreadsheet_source" ||
    type === "business_card" ||
    (wantsExcel && !wantsWord)
  ) {
    // CSV 要望は xlsx 本体 + txt（CSV本文）で完了。DeliverableFormat に csv は無い。
    if (/CSV|csv/.test(text) || type === "business_card") {
      return wantsPdf ? ["xlsx", "txt", "pdf"] : ["xlsx", "txt"];
    }
    return wantsPdf ? ["xlsx", "pdf"] : ["xlsx"];
  }

  if (
    recommended === "contract_docx" ||
    recommended === "chart_report_docx" ||
    recommended === "improved_sales_doc" ||
    recommended === "memo_text" ||
    recommended === "screenshot_summary_docx" ||
    recommended === "manual_docx" ||
    recommended === "photo_report_docx" ||
    recommended === "meeting_minutes_docx" ||
    recommended === "construction_report_docx" ||
    type === "contract" ||
    type === "chart" ||
    type === "handwritten_note" ||
    type === "sales_material" ||
    type === "screenshot" ||
    type === "meeting_minutes" ||
    type === "whiteboard" ||
    type === "construction_photo" ||
    wantsWord
  ) {
    return wantsPdf ? ["docx", "pdf"] : ["docx"];
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
    receipt_voucher: "家計簿（領収書）",
    invoice: "請求管理データ",
    delivery_note: "納品・請求管理データ",
    contract: "契約書要約",
    chart: "グラフ分析レポート",
    table: "表データ",
    spreadsheet_source: "表データ",
    handwritten_note: "手書きメモ整理",
    business_card: "連絡先一覧",
    sales_material: "営業資料改善案",
    screenshot: "操作マニュアル",
    meeting_minutes: "議事録",
    whiteboard: "議事録（ホワイトボード）",
    construction_photo: "施工報告書",
    general_photo: "写真レポート",
    property_photo: "物件写真レポート",
    equipment_photo: "設備写真レポート",
    identity_document: "身分証情報整理",
    estimate: "見積データ",
  };
  return map[type] ?? "画像解析レポート";
}
