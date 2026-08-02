import type {
  MemorySource,
  MemoryStatus,
  PersonalMemoryKind,
  PersonalMemoryScope,
} from "@/lib/personal-memory/types";

export const KIND_LABELS: Record<PersonalMemoryKind, string> = {
  user_preference: "好み・スタイル",
  work_preference: "仕事の進め方",
  default_destination: "保存先・送信先",
  automation_preference: "自動化の確認・通知",
  naming_convention: "名前の付け方",
  template_preference: "テンプレート",
  locale: "言語・地域",
  sensitive: "大切な連絡先・保存先",
};

export const SCOPE_LABELS: Record<PersonalMemoryScope, string> = {
  writing_style: "文体",
  document_design: "デザイン",
  color_palette: "配色",
  preferred_formats: "ファイル形式",
  file_naming: "ファイル名",
  notification_preferences: "通知",
  approval_preferences: "承認方針",
  work_content_style: "資料の書き方",
  default_recipients: "送信先",
  default_storage_locations: "保存先",
  calendar_defaults: "カレンダー",
  wordpress_defaults: "WordPress",
  automation_execution: "自動化の実行方針",
  date_format: "日付形式",
  title_format: "タイトル形式",
  sheet_naming: "シート名",
  artifact_naming: "成果物名",
  word_template: "Wordテンプレート",
  excel_template: "Excelテンプレート",
  powerpoint_theme: "PowerPointテーマ",
  pdf_layout: "PDFレイアウト",
  language: "言語",
  timezone: "タイムゾーン",
  currency: "通貨",
  contact_info: "連絡先",
  customer_info: "顧客情報",
  recurring_work_preferences: "繰り返しの仕事",
  bullet_style: "箇条書き",
  image_output: "画像サイズ",
  ocr_postprocess: "OCR後処理",
  company_template: "会社テンプレート",
  client_style: "営業先ごとの癖",
  ai_model_preference: "AIモデル選択",
  preferred_work_hours: "よく使う時間帯",
};

export const STATUS_LABELS: Record<MemoryStatus, string> = {
  candidate: "候補",
  active: "使用中",
  rejected: "拒否済み",
  expired: "有効期限切れ",
  deleted: "削除済み",
  paused: "使用停止",
};

export const SOURCE_LABELS: Record<MemorySource, string> = {
  explicit: "あなたが指定",
  user_explicit: "あなたが指定",
  approved_inference: "提案を承認",
  correction: "修正から学習（承認済み）",
  user_correction: "修正から提案",
  automation: "自動化の設定",
  automation_result: "自動化の結果",
  imported: "取り込み",
  external_content: "外部文書（保存しません）",
  system_inference: "システムの推測",
};

export function describeScopeGroup(scope: PersonalMemoryScope): string {
  return SCOPE_LABELS[scope] ?? "その他";
}
