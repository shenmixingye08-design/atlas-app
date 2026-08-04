/**
 * 【ATLAS機能評価】P0-5 Durable X Scheduled Posts
 *
 * 機能名：X下書き・予約投稿の Durable DB 単一SoT化
 * ユーザー価値：Cold Start / 再起動後も予約が残り、二重投稿しない
 * 差別化：atomic claim + providerPostId 必須 + unknown_outcome 再投稿禁止
 * 繰り返し作業の削減：はい（再予約・再確認・重複削除の手作業を削減）
 * AI必要度：不要（投稿本文生成は既存。本P0は永続化・claim）
 * AIなしで実装可能：はい
 * 運営コスト：低（Postgres + 既存 X API）
 * 外部APIコスト：既存 X API のみ（新規AIなし）
 * コスト削減案：エコ N/A / まとめ=batch tick / キャッシュ=idempotency /
 *   予約=scheduledAt / AIなし / 外部API最小化=claim後1回 / 承認=approvalStatus /
 *   再生成禁止=providerPostId unique + unknown_outcome
 * 優先度：P0
 */
export const P0_5_FEATURE_EVALUATION = {
  name: "P0-5 Durable X Scheduled Posts",
  priority: "P0" as const,
};
