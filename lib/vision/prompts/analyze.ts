import type { VisionDetectedType, VisionDetailLevel } from "@/lib/vision/types";

function purposeGuidance(hintType: VisionDetectedType): string {
  switch (hintType) {
    case "receipt":
    case "receipt_voucher":
      return [
        "用途: レシート／領収書",
        "必須抽出: storeName, date, items[{name,amount,category}], subtotal, tax, amountTaxExcluded, amountTaxIncluded, total, paymentMethod, companyName, address, phone",
        "読めない金額は null。合計と明細の矛盾は warnings へ。",
      ].join("\n");
    case "invoice":
      return [
        "用途: 請求書",
        "必須抽出: issuer, recipient, invoiceNumber, issueDate, dueDate, lineItems[{name,quantity,unitPrice,amount}], subtotal, tax, amountTaxExcluded, amountTaxIncluded, total, bankDetails, address, phone, email",
      ].join("\n");
    case "delivery_note":
      return [
        "用途: 納品書",
        "必須抽出: issuer, recipient, deliveryNumber, date, lineItems, total, companyName, address",
      ].join("\n");
    case "estimate":
      return [
        "用途: 見積書",
        "必須抽出: issuer, recipient, estimateNumber, issueDate, validUntil, lineItems, subtotal, tax, total",
      ].join("\n");
    case "contract":
      return [
        "用途: 契約書",
        "必須抽出: parties, effectiveDate, expiryDate, keyClauses[], amounts, governingLaw, signature, seal",
        "layout に header/footer/pageNumbers/signature/seal を入れる。",
      ].join("\n");
    case "table":
    case "spreadsheet_source":
      return [
        "用途: 表・帳票",
        "tables に行列構造を保持（headers + rows）。layout.cells にセル座標があれば入れる。崩れたセルは null。",
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
        "必須抽出: personName, companyName, title, department, phone, email, address, url",
      ].join("\n");
    case "meeting_minutes":
    case "whiteboard":
      return [
        "用途: 議事録／ホワイトボード",
        "必須抽出: date, attendees, agenda, decisions[], actionItems[], cleanedText",
        "箇条書きは layout.bulletLists へ。",
      ].join("\n");
    case "screenshot":
      return [
        "用途: スクリーンショット（マニュアル化）",
        "fields: appOrSite, purpose, keyUiText[], steps[]。UI上の文字と操作手順を優先抽出。",
      ].join("\n");
    case "construction_photo":
      return [
        "用途: 施工写真",
        "fields: siteName, location, date, workDescription, progress, safetyNotes。visualElements に写っている対象。",
      ].join("\n");
    case "identity_document":
      return [
        "用途: 身分証",
        "必須抽出: personName/name, date。個人情報は必要最小限。勝手に補完しない。",
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
        "画像種類を detectedType で判定し、用途に応じた fields / tables / layout を埋める。",
        "候補: receipt|receipt_voucher|invoice|delivery_note|estimate|contract|business_card|meeting_minutes|handwritten_note|whiteboard|screenshot|table|chart|construction_photo|identity_document|general_photo など",
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
    "日本語・英語・数字・日付・住所・電話・メール・会社名・税込/税抜/消費税・数量・単価・合計を優先して正確に読む。文字化けは避ける。",
    "layout には title, headings, paragraphs, bulletLists, hasTable, hasImage, header, footer, pageNumbers, signature, seal, cells を可能な範囲で入れる。",
    "暗い・傾き・ぼやけ・切れがあっても読める範囲で抽出し、warnings に画質メモを入れる。",
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
      "ユーザー依頼から必要な成果物形式（Excel/Word/PDF/PowerPoint/CSV等）を読み取り、artifactSuggestions に反映してください。OCRだけで終わらせないでください。",
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
        "receipt|receipt_voucher|invoice|delivery_note|estimate|contract|business_document|sales_material|table|spreadsheet_source|chart|handwritten_note|business_card|whiteboard|screenshot|meeting_minutes|property_photo|equipment_photo|construction_photo|identity_document|social_media_reference|design_reference|general_photo|unknown",
      confidence: 0.0,
      summary: "短い要約（何の画像で、仕事にどう使えるか）",
      extractedText: "画像内文字の転記またはnull",
      language: "ja|en|null",
      fields: {
        companyName: null,
        address: null,
        phone: null,
        email: null,
        date: null,
        amountTaxIncluded: null,
        amountTaxExcluded: null,
        tax: null,
        quantity: null,
        unitPrice: null,
        total: null,
      },
      tables: [{ headers: ["列"], rows: [["値"]], notes: null }],
      visualElements: ["ロゴ", "写真", "グラフ"],
      layout: {
        hierarchy: null,
        sections: [],
        readability: null,
        title: null,
        headings: [],
        paragraphs: [],
        bulletLists: [],
        hasTable: false,
        hasImage: false,
        header: null,
        footer: null,
        pageNumbers: [],
        signature: null,
        seal: null,
        cells: [],
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
        "contact_list_excel",
        "meeting_minutes_docx",
        "construction_report_docx",
        "manual_docx",
        "contract_docx",
        "chart_report_docx",
        "improved_sales_doc",
        "table_excel",
        "memo_text",
        "photo_report_docx",
      ],
    }),
  ].join("\n");
}
