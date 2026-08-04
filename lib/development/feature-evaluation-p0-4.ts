/**
 * 【ATLAS機能評価】P0-4 Durable User Notification Inbox
 *
 * 機能名：ユーザー単位 Durable 通知 Inbox
 * ユーザー価値：Cold Start / 別インスタンス後も通知・既読が残り、他ユーザーと混ざらない
 * 差別化：global 500バッファ廃止、DB unique idempotency
 * 繰り返し作業の削減：はい（再確認・再送・問い合わせ削減）
 * AI必要度：不要
 * AIなしで実装可能：はい
 * 運営コスト：低（Postgres + 既存 Push/LINE）
 * 外部APIコスト：既存 Push/LINE のみ（新規AIなし）
 * コスト削減案：エコ N/A / まとめ=digest / キャッシュ=idempotency /
 *   予約=retry / AIなし / 外部API最小化=ACK後配信 / 承認 N/A / 再生成禁止=unique key
 * 優先度：P0
 */
export const P0_4_FEATURE_EVALUATION = {
  name: "P0-4 Durable User Notification Inbox",
  priority: "P0" as const,
};
