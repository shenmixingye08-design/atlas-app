/**
 * 【ATLAS機能評価】
 *
 * 機能名：初回価値体験（AI秘書ホーム / Quick Start）
 * ユーザー価値：登録後15分以内に「仕事が終わった」を体験し、980円の価値を理解できる
 * 差別化：チャット開始ではなく、空ホーム禁止・その場実行・削減時間表示で秘書体験を先に出す
 * 繰り返し作業の削減：はい（最初のAutomation作成と初回成果物までの迷いを消す）
 * AI必要度：低 — 提案1件・ROI・Quick Startは既存データとルール。成果物生成のみ既存AI
 * AIなしで実装可能：一部 — ホーム/CTA/ROI/Analyticsはプログラム。成果物本文のみAI
 * 運営コスト：追加AI呼び出しなし（Quick Startは既存オーケストレーション経路）
 * 外部APIコスト：無（初回体験UI自体）。成果物生成時のみ既存コスト
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて提案禁止（1件だけ）
 *   - キャッシュ再利用（既存home-data）
 *   - 予約実行は後回し、まず一度試す
 *   - AI起動は成果物生成時のみ
 *   - 外部API最小化
 *   - 自動化保存後に承認/テスト実行
 *   - 同じ提案を連発しない
 * 優先度：P0
 */

export const FIRST_VALUE_FEATURE_EVALUATION = {
  name: "first_value_secretary_home",
  priority: "P0",
  aiRequired: "low",
  phase: "activation",
} as const;
