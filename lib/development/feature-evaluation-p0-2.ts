/**
 * 【ATLAS機能評価】P0-2 Durable Job Claim
 *
 * 機能名：Production Durable Job Claim（原子的 DB claim / メモリ fallback 禁止）
 * ユーザー価値：複数インスタンスでも二重実行・Job消失を防ぐ
 * 差別化：サーバーレスでも Postgres SKIP LOCKED 一本化
 * 繰り返し作業の削減：はい（障害復旧・再実行オペレーション削減）
 * AI必要度：不要
 * AIなしで実装可能：はい
 * 運営コスト：低（通常プログラム + Postgres）
 * 外部APIコスト：無
 * コスト削減案：エコ N/A / まとめ N/A / キャッシュ=lease / 予約=availableAt /
 *   AI起動なし / 外部API最小化 / 承認 N/A / 再生成禁止=idempotency
 * 優先度：P0
 */
export const P0_2_FEATURE_EVALUATION = {
  name: "P0-2 Durable Job Claim",
  priority: "P0" as const,
};
