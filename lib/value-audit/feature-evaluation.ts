/**
 * 【ATLAS機能評価】
 *
 * 機能名：競合差別化・有料価値・実利用価値監査（Phase 5）
 *
 * ユーザー価値：ChatGPT等ではなく月額980円を継続する理由を、実装事実と導線で証明する
 *
 * 差別化：短い日本語→実ファイル完成、画像→表/報告書、履歴・再編集・定期実行（実装済み範囲のみ）
 *
 * 繰り返し作業の削減：はい — 資料作成・集計・再提出の手作業を減らす（未検証の外部実行は除外）
 *
 * AI必要度：中 — 文章/画像理解のみAI。形式判定・履歴・課金・計測はプログラム
 *
 * AIなしで実装可能：一部 — 計測・価格試算・UI導線はAI不要
 *
 * 運営コスト：AI 1依頼あたり数回＋Storage。Light 120回/月で原価設計
 *
 * 外部APIコスト：有 — OpenAI（本文/Vision）、Clerk、Supabase。Stripeは課金基盤
 *
 * コスト削減案：
 * - [x] エコモードで足りるか（Standard以上で既存）
 * - [x] まとめて生成できるか（依頼1回で成果物）
 * - [x] キャッシュ再利用（成果物/変換idempotency）
 * - [x] 予約実行（automations）
 * - [x] AI起動条件を絞る（ルール理解＋課金ゲート）
 * - [x] 外部API最小化（未接続を成功扱いしない）
 * - [x] 承認後実行（execution level既存）
 * - [x] 再生成禁止（idempotency / 履歴再利用）
 *
 * 優先度：P0
 */

export const VALUE_AUDIT_FEATURE_EVALUATION = {
  name: "value-differentiation-phase5",
  priority: "P0",
  aiRequired: "medium",
  reducesHabitualWork: true,
} as const;
