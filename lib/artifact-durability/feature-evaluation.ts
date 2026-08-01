/**
 * 【ATLAS機能評価】
 *
 * 機能名：成果物耐久試験（Word/Excel/PDF/PowerPoint n≥100）
 *
 * ユーザー価値：各形式を実際に開いて使えるところまで成功率で証明する
 *
 * 差別化：n=1や自己採点ではなく実バイナリ生成・構造検証・保存・DL・revision
 *
 * 繰り返し作業の削減：はい — 手動開封確認を削減
 *
 * AI必要度：不要（本文は合成、生成器は決定論的）
 *
 * AIなしで実装可能：はい
 *
 * 運営コスト：低〜中（ローカル生成中心、本番は明示opt-in）
 *
 * 外部APIコスト：無（OpenAI不要）
 *
 * コスト削減案：AI不使用、本番は各形式20件のみ、承認後実行、キャッシュ禁止（測定時）
 *
 * 優先度：P0
 */

export const ARTIFACT_DURABILITY_FEATURE_EVALUATION = {
  name: "成果物耐久試験 Phase2",
  priority: "P0",
  aiRequired: "none",
  reducesHabitualWork: true,
} as const;
