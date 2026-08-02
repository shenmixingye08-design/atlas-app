/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation First UI（ログイン後アプリ再設計）
 * ユーザー価値：開いた瞬間に「仕事を継続実行する秘書」だと分かり、今日の仕事・承認・成果を迷わず扱える
 * 差別化：単発チャット中心ではなく自動化・今日の仕事・対応事項が主役
 * 繰り返し作業の削減：はい（毎回の探し直し・迷い・誤タップが減る）
 * AI必要度：不要 — UI/情報設計のみ。データは既存API
 * AIなしで実装可能：はい
 * 運営コスト：追加APIコストなし。Feature Flagで段階公開
 * 外部APIコスト：無
 * コスト削減案：エコモード無関係 / まとめて表示 / キャッシュ済み一覧再利用 /
 *   予約不要 / AI起動なし / 外部APIなし / 承認導線は既存 / 再生成なし
 * 優先度：P0
 */

export const AUTOMATION_FIRST_UI_FEATURE_EVALUATION = {
  name: "automation_first_ui",
  priority: "P0",
  aiRequired: false,
} as const;
