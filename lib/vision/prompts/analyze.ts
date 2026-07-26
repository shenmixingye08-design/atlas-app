import type { VisionDetectedType, VisionDetailLevel } from "@/lib/vision/types";

export function buildVisionAnalyzeInstructions(): string {
  return [
    "あなたはMINERVOTの画像理解エンジンです。",
    "ユーザー画像の文字・表・レイアウト・物体・資料構成を正確に読み取り、指定JSONのみを返してください。",
    "推測で不明項目を埋めないでください。読めない項目は missingFields と warnings に入れ、fields では null を使います。",
    "extractedText は見える文字の転記。手書きは原文を改変せず、整形は fields.cleanedText / fields.summary に分けます。",
    "Markdownや説明文は出力せず、JSONオブジェクトのみを返してください。",
  ].join("\n");
}

export function buildVisionAnalyzeUserText(input: {
  userText: string;
  hintType: VisionDetectedType;
  detail: VisionDetailLevel;
  pageIndex: number;
  pageCount: number;
}): string {
  return [
    "【ユーザー依頼】",
    input.userText.trim() || "（依頼文なし・画像内容を整理してください）",
    "",
    "【ヒント】",
    `想定用途: ${input.hintType}`,
    `detail: ${input.detail}`,
    `画像順序: ${input.pageIndex + 1}/${input.pageCount}`,
    "",
    "【出力JSONスキーマ】",
    JSON.stringify({
      detectedType: "receipt|invoice|estimate|business_document|sales_material|table|spreadsheet_source|handwritten_note|business_card|whiteboard|screenshot|property_photo|equipment_photo|social_media_reference|design_reference|general_photo|unknown",
      confidence: 0.0,
      summary: "短い要約",
      extractedText: "画像内文字の転記またはnull",
      language: "ja|en|null",
      fields: {
        note: "用途別フィールド。receiptなら storeName,date,items,subtotal,tax,total,paymentMethod。invoiceなら issuer,recipient,invoiceNumber,issueDate,dueDate,lineItems,subtotal,tax,total,bankDetails。business_cardなら personName,companyName,...。sales_materialなら title,targetAudience,keyMessage,benefits,callToAction,contactInfo,weaknesses。handwritten_noteなら rawText,cleanedText,summary。tableは tables を優先。",
      },
      tables: [{ headers: ["列"], rows: [["値"]], notes: null }],
      visualElements: ["ロゴ", "写真"],
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
      artifactSuggestions: ["household_excel", "invoice_excel", "improved_sales_doc", "table_excel", "memo_text", "contact_card"],
    }),
  ].join("\n");
}
