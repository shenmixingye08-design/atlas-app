import type { VisionDetectedType, VisionDetailLevel } from "@/lib/vision/types";

const PRECISION_RULES = [
  "最重要: 読めないものを推測して埋めない。誤った確定値より未確定（null + warnings）を優先する。",
  "金額が ¥8,980 か ¥3,980 か判別できない場合は value を null、warnings に「金額を判別できません」。どちらかへ確定しない。",
  "画像に無い金額・氏名・商品・日付・URL・電話・メール・表の行・グラフ数値を生成しない。",
  "税込/税抜、8%/10%、値引き、ポイント、クーポン、軽減税率、複数税率を混同しない。不明なら null。",
  "合計と明細が合わなくても架空の商品や値引きを足して合わせない。warnings に不一致を書く。",
  "結合セル・多段ヘッダーは無理に平坦化せず tables.mergedRegions / notes に残す。",
  "グラフの具体値が読めない場合は傾向のみ。ピクセルから精密数値を作らない。",
  "手書きは rawText（見えた文字）と cleanedText（整形）と summary を分離。読めない文字を文章として補完しない。",
  "名刺は personName と companyName を逆にしない。",
  "写真は observed（見えていること）と inference（推論）を分ける。故障・危険・交換必須を断定しない。",
  "同じ画像でも依頼が「説明して」と「Excelにして」では artifactSuggestions を切り替える。解析フィールドは捏造しない。",
].join("\n");

function purposeGuidance(hintType: VisionDetectedType): string {
  switch (hintType) {
    case "receipt":
      return [
        "用途: レシート／領収書",
        "必須抽出: storeName, date, time, items[{name,quantity,unitPrice,amount}], subtotal, discount, tax, total, paymentMethod, currency",
        "税込/税抜・税率・値引き・ポイント・クーポンは別フィールド。混同しない。",
        "読めない金額は null。合計と明細の矛盾は warnings へ。架空行は追加しない。",
      ].join("\n");
    case "invoice":
      return [
        "用途: 請求書",
        "必須抽出: issuer, recipient, documentNumber または invoiceNumber, issueDate, dueDate, lineItems[{name,quantity,unitPrice,amount}], subtotal, tax, total, bankDetails",
        "会社名と宛先と請求金額が離れていてもレイアウトで関連付ける。表構造を保持。",
      ].join("\n");
    case "estimate":
      return [
        "用途: 見積書",
        "必須抽出: issuer, recipient, documentNumber または estimateNumber, issueDate, validUntil, lineItems, subtotal, tax, total",
        "表構造を保持。有効期限と発行日を混同しない。",
      ].join("\n");
    case "contract":
      return [
        "用途: 契約書",
        "必須抽出: parties, effectiveDate, expiryDate, keyClauses[], amounts, governingLaw",
        "読めない条項は補完せず missingFields。",
      ].join("\n");
    case "table":
    case "spreadsheet_source":
      return [
        "用途: 表・帳票 / Excel元データ写真",
        "tables に columns 相当の headers + rows + columnTypes。セルは text/number/date/percentage/currency/unknown。",
        "1セルdumpやOCR文章の平坦化は禁止。結合セルは mergedRegions に残す。",
      ].join("\n");
    case "chart":
      return [
        "用途: グラフ",
        "fields: chartType, title, xAxis, yAxis, series, legend, visibleValues, trend",
        "正確な数値が読めない場合は trend のみ、visibleValues は null、warnings に「具体値は判別不可」。",
      ].join("\n");
    case "handwritten_note":
      return [
        "用途: 手書きメモ",
        "fields.rawText に原文、cleanedText に整形、summary に要約。読めない箇所は missingFields。勝手に文章補完しない。",
      ].join("\n");
    case "business_card":
      return [
        "用途: 名刺",
        "必須抽出: personName, companyName, department, title, phone, mobile, email, postalCode, address, url",
        "会社名と氏名を逆にしない。",
      ].join("\n");
    case "screenshot":
      return [
        "用途: スクリーンショット",
        "fields: appOrSite, purpose, keyUiText[], errorCode, visibleMessage, state, actionableElements[]",
        "エラー画面はコードと表示メッセージを正確に。単なるOCR dumpで終わらない。",
      ].join("\n");
    case "sales_material":
    case "business_document":
      return [
        "用途: 営業・業務資料",
        "layout / styleSignals / visualElements を厚めに。改善可能な点を recommendedActions へ。",
      ].join("\n");
    case "whiteboard":
      return [
        "用途: ホワイトボード",
        "fields.rawText / cleanedText / summary。板書の構造（箇条書き・図）を残す。",
      ].join("\n");
    case "property_photo":
    case "equipment_photo":
    case "general_photo":
      return [
        "用途: 設備 / 現場 / 一般写真",
        "fields.observed に実際に見えている内容、fields.inference に推論。断定しない。",
        "文字があれば extractedText へ。",
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
    PRECISION_RULES,
    "extractedText は見える文字の転記。手書きは原文を改変せず、整形は fields.cleanedText / fields.summary に分けます。",
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
      "ユーザー依頼から必要な成果物形式（Excel/Word/PDF等）を読み取り、artifactSuggestions に反映してください。解析フィールド自体は依頼で捏造しないでください。",
    "",
    "【解析フォーカス】",
    purpose,
    "",
    "【精度】",
    PRECISION_RULES,
    "",
    "【ヒント】",
    `想定用途: ${input.hintType}`,
    `detail: ${input.detail}`,
    `画像順序: ${input.pageIndex + 1}/${input.pageCount}`,
    input.pageCount > 1
      ? "複数画像: 同一書類のページなら順序を維持。別レシートなら数字を混ぜない。表裏なら合計を二重計上しない。"
      : "",
    "",
    "【出力JSONスキーマ】",
    JSON.stringify({
      detectedType:
        "receipt|invoice|estimate|contract|business_document|sales_material|table|spreadsheet_source|chart|handwritten_note|business_card|whiteboard|screenshot|property_photo|equipment_photo|social_media_reference|design_reference|general_photo|unknown",
      confidence: 0.0,
      summary: "短い要約（何の画像で、仕事にどう使えるか）",
      extractedText: "画像内文字の転記またはnull",
      language: "ja|en|mixed|null",
      fields: {},
      fieldConfidence: { overall: 0.0, total: 0.0, date: 0.0 },
      tables: [
        {
          headers: ["列"],
          rows: [["値"]],
          notes: null,
          columnTypes: ["text"],
          cellConfidence: [[0.9]],
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
