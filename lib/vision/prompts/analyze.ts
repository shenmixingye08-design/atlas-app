import type { VisionDetectedType, VisionDetailLevel } from "@/lib/vision/types";

function purposeGuidance(hintType: VisionDetectedType): string {
  switch (hintType) {
    case "receipt":
      return [
        "用途: レシート／領収書",
        "必須抽出: storeName, date, items[{name,amount,category}], subtotal, tax, total, paymentMethod",
        "読めない金額は null。合計と明細の矛盾は warnings へ。",
      ].join("\n");
    case "invoice":
      return [
        "用途: 請求書",
        "必須抽出: issuer, recipient, invoiceNumber, issueDate, dueDate, lineItems, subtotal, tax, total, bankDetails",
      ].join("\n");
    case "estimate":
      return [
        "用途: 見積書",
        "必須抽出: issuer, recipient, estimateNumber, issueDate, validUntil, lineItems, subtotal, tax, total",
      ].join("\n");
    case "contract":
      return [
        "用途: 契約書",
        "必須抽出: parties, effectiveDate, expiryDate, keyClauses[], amounts, governingLaw",
      ].join("\n");
    case "table":
    case "spreadsheet_source":
      return [
        "用途: 表・帳票",
        "tables に行列構造を保持（headers + rows）。崩れたセルは null。",
      ].join("\n");
    case "chart":
      return [
        "用途: グラフ",
        "fields: chartType, title, xAxis, yAxis, series, trend, insights",
      ].join("\n");
    case "handwritten_note":
      return [
        "用途: 手書きメモ",
        "fields.rawText に原文、cleanedText に整形、summary に要約。読めない箇所は missingFields。",
      ].join("\n");
    case "business_card":
      return [
        "用途: 名刺",
        "必須抽出: personName, companyName, title, phone, email, address, url",
      ].join("\n");
    case "screenshot":
      return [
        "用途: スクリーンショット",
        "fields: appOrSite, purpose, keyUiText[]。UI上の文字を優先抽出。",
      ].join("\n");
    case "sales_material":
    case "business_document":
      return [
        "用途: 営業・業務資料",
        "layout / styleSignals / visualElements を厚めに。改善可能な点を recommendedActions へ。",
      ].join("\n");
    case "property_photo":
    case "equipment_photo":
    case "general_photo":
      return [
        "用途: 一般写真",
        "写っている内容・状況・仕事への使い方を summary と visualElements で説明。文字があれば extractedText へ。",
      ].join("\n");
    default:
      return [
        "用途: 自動判定",
        "画像種類を detectedType で判定し、用途に応じた fields / tables を埋める。",
      ].join("\n");
  }
}

export function buildVisionAnalyzeInstructions(input?: {
  hintType?: VisionDetectedType;
}): string {
  const purpose = purposeGuidance(input?.hintType ?? "unknown");
  return [
    "あなたはMINERVOTの画像理解エンジンです。",
    "OCR転記だけで終わらず、画像の種類・構造・意味・仕事への使い方まで理解してください。",
    "Structured Outputs の JSON Schema に厳密に従ってください。自由文の成功・失敗判定は禁止です。",
    "image_readable: 画像が読めるなら true。真っ黒・破損・内容不明なら false。",
    "needs_user_input: 解析自体は完了したが依頼の必須項目が画像に無いときだけ true（timeoutとは別）。",
    "document_type に画像種類、detected_fields に key/value 配列で抽出項目を入れてください。",
    "推測で不明項目を埋めないでください。読めない項目は missing_required_fields と warnings へ。",
    "extracted_text は見える文字の転記。",
    purpose,
    "Markdownや説明文は出力せず、スキーマ準拠の JSON のみを返してください。",
  ].join("\n");
}

export function buildVisionAnalyzeUserText(input: {
  userText: string;
  hintType: VisionDetectedType;
  detail: VisionDetailLevel;
  pageIndex: number;
  pageCount: number;
  artifactHint?: string | null;
}): string {
  const purpose = purposeGuidance(input.hintType);
  return [
    "【ユーザー依頼】",
    input.userText.trim() || "（依頼文なし・画像内容を整理し、成果物化できる形にしてください）",
    "",
    "【成果物・用途の指示】",
    input.artifactHint?.trim() ||
      "ユーザー依頼から必要な成果物形式（Excel/Word/PDF等）を読み取り、artifactSuggestions に反映してください。",
    "",
    "【解析フォーカス】",
    purpose,
    "",
    "【ヒント】",
    `想定用途: ${input.hintType}`,
    `detail: ${input.detail}`,
    `画像順序: ${input.pageIndex + 1}/${input.pageCount}`,
    "",
    "【出力は Structured Outputs スキーマ準拠】",
    "必須: image_readable, document_type, detected_fields[{key,value}], missing_required_fields, confidence, needs_user_input, user_message, summary, extracted_text, language, tables, visual_elements, warnings, recommended_actions, artifact_suggestions",
  ].join("\n");
}
