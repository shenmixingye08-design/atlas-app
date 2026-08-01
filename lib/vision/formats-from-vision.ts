import type { DeliverableFormat } from "@/lib/deliverables/types";
import type { VisionBatchResult, VisionDetectedType } from "@/lib/vision/types";

export type VisionFormatSelection = {
  formats: DeliverableFormat[];
  reason: string;
};

/**
 * Map vision understanding → deliverable formats (no Planner core changes).
 * AI-suggested artifact_suggestions / recommendedArtifactType win when present;
 * otherwise type heuristics. May return multiple formats.
 */
export function formatsFromVisionBatch(
  batch: VisionBatchResult,
  assignment = "",
): DeliverableFormat[] {
  return selectFormatsFromVision(batch, assignment).formats;
}

export function selectFormatsFromVision(
  batch: VisionBatchResult,
  assignment = "",
): VisionFormatSelection {
  const type =
    (batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    batch.images[0]?.detectedType ??
    "unknown";
  const recommended = batch.recommendedArtifactType;
  const suggestions = [
    ...(batch.images[0]?.artifactSuggestions ?? []),
    recommended ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const text = assignment;

  const wantsPdf = /PDF|pdf/.test(text) || /\bpdf\b/.test(suggestions);
  const wantsWord =
    /Word|ワード|docx/.test(text) || /docx|word/.test(suggestions);
  const wantsExcel =
    /Excel|エクセル|xlsx|家計簿|CSV|csv/.test(text) ||
    /xlsx|excel|csv|spreadsheet/.test(suggestions);
  const wantsPptx =
    /PowerPoint|パワポ|pptx|スライド|プレゼン/.test(text) ||
    /pptx|slide|deck/.test(suggestions);
  const wantsMd = /Markdown|マークダウン|\.md\b/i.test(text);
  const wantsJson = /JSON|\.json\b/i.test(text);

  const formats = new Set<DeliverableFormat>();

  // Spreadsheet-like
  if (
    recommended === "household_excel" ||
    recommended === "invoice_excel" ||
    recommended === "table_excel" ||
    type === "receipt" ||
    type === "invoice" ||
    type === "estimate" ||
    type === "table" ||
    type === "spreadsheet_source" ||
    (wantsExcel && !wantsWord)
  ) {
    formats.add("xlsx");
    if (/csv/i.test(text) || /csv/.test(suggestions)) {
      // CSV is not a DeliverableFormat — Excel covers tabular export.
    }
  }

  // Document-like
  if (
    recommended === "contract_docx" ||
    recommended === "chart_report_docx" ||
    recommended === "improved_sales_doc" ||
    recommended === "memo_text" ||
    recommended === "screenshot_summary_docx" ||
    recommended === "photo_report_docx" ||
    recommended === "contact_card" ||
    type === "contract" ||
    type === "business_document" ||
    type === "handwritten_note" ||
    type === "business_card" ||
    type === "whiteboard" ||
    type === "screenshot" ||
    type === "sales_material" ||
    wantsWord
  ) {
    formats.add("docx");
  }

  // Chart / UI / sales deck → PowerPoint when asked or chart-heavy
  if (
    wantsPptx ||
    type === "chart" ||
    (type === "sales_material" && /スライド|deck|pptx/i.test(text + suggestions))
  ) {
    formats.add("pptx");
  }

  // Chart reports also get a Word summary unless the user only asked for slides.
  if (type === "chart" && !wantsPptx) {
    formats.add("docx");
  } else if (type === "chart" && !formats.has("docx") && !formats.has("pptx")) {
    formats.add("docx");
  }

  if (wantsMd) formats.add("md");
  // JSON not in DeliverableFormat — keep md/docx for structured dumps.
  if (wantsJson && !formats.has("md")) formats.add("md");

  // PDF only when asked, or for contract packages (enterprise submit).
  if (wantsPdf || type === "contract") {
    formats.add("pdf");
  }

  if (formats.size === 0) {
    formats.add("docx");
  }

  // Photo reports: docx + pdf when property/equipment
  if (type === "property_photo" || type === "equipment_photo" || type === "general_photo") {
    formats.add("docx");
    if (wantsPdf) formats.add("pdf");
  }

  const ordered = orderFormats([...formats]);
  return {
    formats: ordered,
    reason: `type=${type};recommended=${recommended ?? "none"}`,
  };
}

function orderFormats(formats: DeliverableFormat[]): DeliverableFormat[] {
  const order: DeliverableFormat[] = [
    "xlsx",
    "docx",
    "pptx",
    "pdf",
    "md",
    "txt",
  ];
  return order.filter((f) => formats.includes(f));
}

export function titleFromVisionBatch(batch: VisionBatchResult): string {
  const type =
    (batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    batch.images[0]?.detectedType ??
    "unknown";
  const map: Partial<Record<VisionDetectedType, string>> = {
    receipt: "家計簿（レシート）",
    invoice: "請求書データ",
    estimate: "見積書データ",
    contract: "契約書要約",
    chart: "グラフ分析レポート",
    table: "表データ",
    spreadsheet_source: "表データ",
    handwritten_note: "手書きメモ整理",
    business_card: "名刺情報",
    sales_material: "営業資料改善案",
    screenshot: "画面キャプチャ整理",
    whiteboard: "ホワイトボード整理",
    business_document: "書類整理",
    general_photo: "写真レポート",
    property_photo: "物件写真レポート",
    equipment_photo: "設備写真レポート",
  };
  return map[type] ?? "画像解析レポート";
}
