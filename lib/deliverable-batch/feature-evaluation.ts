/**
 * 【ATLAS機能評価】
 *
 * 機能名：成果物のまとめて作成
 * ユーザー価値：同じ種類の成果物を1回の依頼で複数作り、個別確認と一括ダウンロードができる
 * 差別化：1件ずつ繰り返さず、試作→残り生成→部分失敗の再試行まで一貫する
 * 繰り返し作業の削減：はい（一覧・CSV・添付ごとに毎回依頼しなくてよい）
 * AI必要度：中 — テーマ分割と本文。件数・状態・ZIP・検証は通常プログラム
 * AIなしで実装可能：一部 — 一覧/CSV分解・進捗・ZIPは可能。文案は既存生成pipeline
 * 運営コスト：Itemごとに既存 deliverables_generate を1回。同時実行は2件
 * 外部APIコスト：有 — 既存 OpenAI 経路のみ。新しい外部APIなし
 * コスト削減案：
 *   - エコモード：試作1件を先に確定し、残りへ同じ文体を再利用
 *   - まとめて生成：本機能そのもの
 *   - キャッシュ：成功Itemは再生成しない
 *   - 予約実行：今回は即時生成のみ
 *   - AI起動条件：Item本文生成時のみ。ZIP・検証はAIなし
 *   - 外部API最小化：1 Item = 1 既存生成。巨大1レスポンスにしない
 *   - 承認後実行：試作承認後に残りを生成
 *   - 再生成禁止：ready Item は retry しない
 * 優先度：P0
 */
export const DELIVERABLE_BATCH_FEATURE_EVALUATION = {
  name: "deliverable-batch-create",
  aiRequired: true,
  stripePricesChanged: false,
  newPlans: false,
  newPlanLimits: false,
  maxItemsTechnical: 12,
} as const;
