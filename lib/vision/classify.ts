import type { VisionDetailLevel, VisionDetectedType } from "@/lib/vision/types";

const TYPE_KEYWORDS: Array<{ type: VisionDetectedType; patterns: RegExp[] }> = [
  { type: "receipt", patterns: [/レシート/, /領収書/, /家計簿/, /receipt/i] },
  { type: "invoice", patterns: [/請求書/, /invoice/i, /請求明細/] },
  { type: "estimate", patterns: [/見積/, /estimate/i, /quotation/i] },
  {
    type: "sales_material",
    patterns: [/営業資料/, /チラシ/, /パンフレット/, /提案資料/, /この資料を改善/, /雰囲気/, /同じ構成/],
  },
  { type: "table", patterns: [/表を?Excel/, /表画像/, /スプレッドシート/, /行列/, /テーブル/] },
  { type: "spreadsheet_source", patterns: [/Excelにして/, /エクセルにして/, /xlsx/i] },
  { type: "handwritten_note", patterns: [/手書き/, /メモを?文章/, /文字にして/, /書き起こ/] },
  { type: "business_card", patterns: [/名刺/, /連絡先として/, /business\s*card/i] },
  { type: "property_photo", patterns: [/土地/, /物件/, /不動産/, /現地写真/] },
  { type: "equipment_photo", patterns: [/設備/, /機械/, /施工/, /現場写真/] },
  { type: "whiteboard", patterns: [/ホワイトボード/, /whiteboard/i] },
  { type: "screenshot", patterns: [/スクリーンショット/, /screenshot/i] },
  { type: "design_reference", patterns: [/デザイン参考/, /参考デザイン/, /同じ雰囲気/] },
  { type: "social_media_reference", patterns: [/SNS/, /投稿参考/, /Instagram|X投稿/i] },
];

export function classifyImagePurposeFromText(
  userText: string,
  fallback: VisionDetectedType = "unknown"
): VisionDetectedType {
  const text = userText.trim();
  if (!text) return fallback;
  for (const entry of TYPE_KEYWORDS) {
    if (entry.patterns.some((re) => re.test(text))) return entry.type;
  }
  if (/改善|分析|見て/.test(text)) return "business_document";
  return fallback;
}

export function recommendDetailLevel(args: {
  detectedType: VisionDetectedType;
  userText: string;
  imageCount: number;
  ecoMode?: boolean;
}): VisionDetailLevel {
  const { detectedType, userText, imageCount, ecoMode } = args;
  const highTypes: VisionDetectedType[] = [
    "receipt",
    "invoice",
    "estimate",
    "table",
    "spreadsheet_source",
    "handwritten_note",
    "business_card",
    "business_document",
    "sales_material",
  ];

  if (ecoMode && imageCount >= 4) return "low";
  if (ecoMode && !highTypes.includes(detectedType)) return "auto";

  if (highTypes.includes(detectedType)) return "high";
  if (/細かく|文字|表|明細|金額|番号/.test(userText)) return "high";
  if (imageCount >= 6) return "low";
  return "auto";
}

export function labelForDetectedType(type: VisionDetectedType): string {
  const map: Record<VisionDetectedType, string> = {
    receipt: "レシートとして認識しました",
    invoice: "請求書として認識しました",
    estimate: "見積書として認識しました",
    business_document: "業務資料として認識しました",
    sales_material: "営業資料として認識しました",
    table: "表データとして認識しました",
    spreadsheet_source: "表・スプレッドシート元として認識しました",
    handwritten_note: "手書きメモとして認識しました",
    business_card: "名刺として認識しました",
    whiteboard: "ホワイトボードとして認識しました",
    screenshot: "スクリーンショットとして認識しました",
    property_photo: "物件・土地写真として認識しました",
    equipment_photo: "設備写真として認識しました",
    social_media_reference: "SNS参考として認識しました",
    design_reference: "デザイン参考として認識しました",
    general_photo: "一般写真として認識しました",
    unknown: "画像の種類を自動判定中です",
  };
  return map[type];
}
