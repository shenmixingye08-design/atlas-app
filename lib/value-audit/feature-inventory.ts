/**
 * Phase5 §0 — 実装事実に基づく機能棚卸し。
 * 「コードがある」だけでは本番利用可能にしない。
 */

export type FeatureAvailability =
  | "本番で正常利用可能"
  | "一部制限あり"
  | "β版"
  | "実装済みだが本番未検証"
  | "UIのみ"
  | "APIのみ"
  | "仮実装"
  | "未実装"
  | "壊れている";

export type FeatureInventoryRow = {
  id: string;
  name: string;
  status: FeatureAvailability;
  evidence: string;
  productionE2e: boolean;
  notes: string;
};

export const FEATURE_INVENTORY: readonly FeatureInventoryRow[] = [
  {
    id: "nl_request",
    name: "自然言語による依頼",
    status: "実装済みだが本番未検証",
    evidence: "app/api/orchestrate + HomeChatBar/WorkRequestForm",
    productionE2e: false,
    notes: "ローカル/ユニットはある。本番E2E未実施",
  },
  {
    id: "request_understanding",
    name: "依頼理解",
    status: "一部制限あり",
    evidence: "lib/request-understanding（ルール中心）",
    productionE2e: false,
    notes: "CSV意図は理解するが成果物ブリッジで落ちる場合あり",
  },
  {
    id: "word",
    name: "Word生成",
    status: "実装済みだが本番未検証",
    evidence: "lib/deliverables DOCX pipeline + local e2e",
    productionE2e: false,
    notes: "ローカル最終成功率は高い。本番Storage未検証",
  },
  {
    id: "excel",
    name: "Excel生成",
    status: "実装済みだが本番未検証",
    evidence: "lib/excel-secretary + api/excel/create",
    productionE2e: false,
    notes: "課金+rate limit付き",
  },
  {
    id: "pdf",
    name: "PDF生成",
    status: "実装済みだが本番未検証",
    evidence: "pdf-generator + JP fonts",
    productionE2e: false,
    notes: "",
  },
  {
    id: "pptx",
    name: "PowerPoint生成",
    status: "実装済みだが本番未検証",
    evidence: "lib/pptx-secretary + api/pptx/create",
    productionE2e: false,
    notes: "",
  },
  {
    id: "csv",
    name: "CSV生成",
    status: "一部制限あり",
    evidence: "xlsx↔csv convert / export。専用CsvGeneratorなし",
    productionE2e: false,
    notes: "NL「CSVで」は主成果物にならないリスク",
  },
  {
    id: "vision",
    name: "画像解析",
    status: "実装済みだが本番未検証",
    evidence: "lib/vision + api/vision/analyze",
    productionE2e: false,
    notes: "OpenAI Vision必須",
  },
  {
    id: "ocr",
    name: "OCR",
    status: "一部制限あり",
    evidence: "Vision OCRプロファイル。専用OCRエンジンなし",
    productionE2e: false,
    notes: "レシート等はVision依存",
  },
  {
    id: "image_to_artifact",
    name: "画像から成果物生成",
    status: "実装済みだが本番未検証",
    evidence: "complete-image-work / vision secretary",
    productionE2e: false,
    notes: "家計簿モジュール自体は未実装",
  },
  {
    id: "file_parse",
    name: "既存ファイル解析",
    status: "一部制限あり",
    evidence: "attachments/documents/extract",
    productionE2e: false,
    notes: "スキャンPDFは弱い",
  },
  {
    id: "file_edit",
    name: "既存ファイル編集",
    status: "一部制限あり",
    evidence: "ATLAS成果物の再生成/版管理。任意DOCX/PDF編集は不可",
    productionE2e: false,
    notes: "",
  },
  {
    id: "convert",
    name: "ファイル形式変換",
    status: "一部制限あり",
    evidence: "artifacts/convert（レイアウト完全保持はしない）",
    productionE2e: false,
    notes: "lossy by design",
  },
  {
    id: "preview",
    name: "成果物プレビュー",
    status: "一部制限あり",
    evidence: "format別プレビューパネル",
    productionE2e: false,
    notes: "未対応形式あり",
  },
  {
    id: "download",
    name: "成果物ダウンロード",
    status: "実装済みだが本番未検証",
    evidence: "api/deliverables/[id]",
    productionE2e: false,
    notes: "Durable Storage依存",
  },
  {
    id: "revision",
    name: "revision",
    status: "一部制限あり",
    evidence: "versioning + revision panels",
    productionE2e: false,
    notes: "",
  },
  {
    id: "jobs",
    name: "ジョブ管理",
    status: "一部制限あり",
    evidence: "lib/jobs",
    productionE2e: false,
    notes: "reclaim CAS未完（High）",
  },
  {
    id: "notifications",
    name: "通知",
    status: "一部制限あり",
    evidence: "in-app + LINE/Push。Email未実装",
    productionE2e: false,
    notes: "VAPID未検証",
  },
  {
    id: "retry",
    name: "再試行",
    status: "一部制限あり",
    evidence: "retry-classifier + job transitions",
    productionE2e: false,
    notes: "",
  },
  {
    id: "x",
    name: "X投稿",
    status: "実装済みだが本番未検証",
    evidence: "integrations/x。Lightはassistのみ、autoはStandard+",
    productionE2e: false,
    notes: "FreeはSNS 0",
  },
  {
    id: "gmail",
    name: "Gmail",
    status: "実装済みだが本番未検証",
    evidence: "Google連携。plan ≥ Standard",
    productionE2e: false,
    notes: "Light(980)では不可",
  },
  {
    id: "gcal",
    name: "Google Calendar",
    status: "実装済みだが本番未検証",
    evidence: "同上",
    productionE2e: false,
    notes: "Lightでは不可",
  },
  {
    id: "wordpress",
    name: "WordPress",
    status: "実装済みだが本番未検証",
    evidence: "integrations/wordpress + feature flag",
    productionE2e: false,
    notes: "blog_creationはStandard+",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    status: "実装済みだが本番未検証",
    evidence: "integrations/dropbox + feature flag",
    productionE2e: false,
    notes: "外部連携枠（Light=1）",
  },
  {
    id: "automation",
    name: "繰り返し自動化",
    status: "一部制限あり",
    evidence: "automations + cron。Light=3件",
    productionE2e: false,
    notes: "Hobby cron制約の可能性",
  },
  {
    id: "external",
    name: "外部連携",
    status: "一部制限あり",
    evidence: "Google/X/WP/Dropbox実実装。Notion/YouTubeはstub",
    productionE2e: false,
    notes: "Free=0",
  },
  {
    id: "mobile",
    name: "モバイル対応",
    status: "一部制限あり",
    evidence: "responsive web + bottom nav。ネイティブアプリなし",
    productionE2e: false,
    notes: "",
  },
] as const;

export function inventoryByStatus(
  status: FeatureAvailability
): FeatureInventoryRow[] {
  return FEATURE_INVENTORY.filter((r) => r.status === status);
}

export function productionReadyCount(): number {
  return FEATURE_INVENTORY.filter((r) => r.status === "本番で正常利用可能")
    .length;
}
