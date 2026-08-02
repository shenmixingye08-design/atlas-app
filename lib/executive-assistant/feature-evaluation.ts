/**
 * 【ATLAS機能評価】
 *
 * 機能名：AI Executive Assistant（先に動く専属AI秘書）
 * ユーザー価値：依頼前に仕事を発見・提案・自動化候補化し、確認と入力の回数を減らす
 * 差別化：チャット待ちではなく、履歴・Memory・曜日・Failureから仕事を見つける
 * 繰り返し作業の削減：はい（毎週同じ依頼・毎回PDF・毎回保存の手動指示を減らす）
 * AI必要度：不要 — 発見・スコア・予測は統計/ルール。文案も定型テンプレ
 * AIなしで実装可能：はい
 * 運営コスト：LLMなし。履歴集計のみ
 * 外部APIコスト：無（Gmail未読等は既存接続時のメタデータのみ）
 * コスト削減案：
 *   - [x] エコ不要（LLMなし）
 *   - [x] 提案はまとめて1日上限
 *   - [x] 却下/スヌーズキャッシュ
 *   - [x] 予測はローカル集計
 *   - [x] AI起動なし
 *   - [x] 外部API最小化（接続済みメタのみ）
 *   - [x] 推測だけでは自動化せず承認/秘書モード後
 *   - [x] 同じ提案の再生成禁止（dedupe）
 * 優先度：P0
 */

export const AI_EXECUTIVE_ASSISTANT_FEATURE_EVALUATION = {
  name: "ai_executive_assistant",
  priority: "P0",
  aiRequired: "none",
  phase: "ai_executive_assistant",
} as const;
