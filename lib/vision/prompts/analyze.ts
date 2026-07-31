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
    "ユーザー画像の文字・表・グラフ・レイアウト・物体・資料構成を正確に読み取り、指定JSONのみを返してください。",
    "推測で不明項目を埋めないでください。読めない項目は missingFields と warnings に入れ、fields では null を使います。",
    "extractedText は見える文字の転記。手書きは原文を改変せず、整形は fields.cleanedText / fields.summary に分けます。",
    "documentStructure には、人が作るWordと同じ読み順で構造を入れてください。",
    "documentStructure の type は title|heading|paragraph|bullet|numbered|table|page_break のみ。",
    "見出し・箇条書き・表・段落を必ず分離し、OCRのベタ書きだけにしないでください。",
    "表は tables と documentStructure の table ブロックの両方に入れてください。",
    purpose,
    "Markdownや説明文は出力せず、JSONオブジェクトのみを返してください。",
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
    "【出力JSONスキーマ】",
    JSON.stringify({
      detectedType:
        "receipt|invoice|estimate|contract|business_document|sales_material|table|spreadsheet_source|chart|handwritten_note|business_card|whiteboard|screenshot|property_photo|equipment_photo|social_media_reference|design_reference|general_photo|unknown",
      confidence: 0.0,
      summary: "短い要約（何の画像で、仕事にどう使えるか）",
      extractedText: "画像内文字の転記またはnull",
      language: "ja|en|null",
      fields: {},
      tables: [{ headers: ["列"], rows: [["値"]], notes: null }],
      documentStructure: [
        { type: "title", text: "文書タイトル" },
        { type: "heading", level: 2, text: "見出し" },
        { type: "paragraph", text: "本文段落" },
        { type: "bullet", items: ["箇条書き1", "箇条書き2"] },
        { type: "numbered", items: ["手順1", "手順2"] },
        {
          type: "table",
          headers: ["列A", "列B"],
          rows: [["値1", "値2"]],
        },
      ],
      visualElements: ["ロゴ", "写真", "グラフ"],
      layout: {
        hierarchy: null,
        sections: [],
        readability: null,
        colorTendency: null,
        logoPosition: null,
        ctaPlacement: null,
      },
      styleSignals: {
        tone: null,
        politeness: null,
        sentenceLength: null,
        headingStyle: null,
        frequentPhrases: [],
        ctaStyle: null,
        structure: null,
        designTendency: null,
        forbiddenCandidates: [],
      },
      warnings: [],
      missingFields: [],
      recommendedActions: [],
      artifactSuggestions: [
        "household_excel",
        "invoice_excel",
        "contract_docx",
        "chart_report_docx",
        "improved_sales_doc",
        "table_excel",
        "memo_text",
        "contact_card",
        "screenshot_summary_docx",
        "photo_report_docx",
      ],
    }),
  ].join("\n");
}
