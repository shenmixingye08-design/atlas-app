export const BUSINESS_PROFILE_FEATURE_NAME =
  "業務プロフィール・安全な情報保管・成果物差し込み基盤（Phase 6）" as const;

export const BUSINESS_PROFILE_FEATURE_EVALUATION = {
  featureName: BUSINESS_PROFILE_FEATURE_NAME,
  userValue:
    "会社名・署名・連絡先などを構造化保存し、資料・メールへ繰り返し手入力せず差し込める",
  differentiation:
    "AI曖昧記憶ではなく権限付き構造化データ。不足時は needs_input で偽完成を防ぐ",
  repetitiveWorkReduction: "はい",
  aiNecessity: "低（CRUD・差し込み・検証は通常プログラム。抽出時のみAI）",
  implementableWithoutAi: "大部分はい",
  operatingCost: "中（テーブル・RLS・暗号化）",
  externalApiCost: "低（抽出時のみ）",
  priority: "P0",
} as const;

export const BUSINESS_PROFILE_COST_REDUCTION_PLAN = [
  "エコモード：既存挙動を変更しない",
  "まとめて生成：対象外",
  "キャッシュ再利用：profile version をキャッシュキーに含め再生成を抑制",
  "予約実行：対象外",
  "AI起動条件：抽出リクエスト時のみ",
  "外部API最小化：sanitizeContextForAI で最小項目のみ",
  "承認後実行：毎回確認・口座は確認後のみ",
  "再生成禁止：artifact_data_bindings で差し込み結果を記録",
] as const;

export const BUSINESS_PROFILE_STORAGE_DECISION =
  "Business profiles are structured durable data, not AI chat memory. Separate from lib/user-profile (job preferences)." as const;
