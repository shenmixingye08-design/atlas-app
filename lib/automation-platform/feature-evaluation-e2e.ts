/**
 * 【ATLAS機能評価】Automation E2E Reliability（検証Phase）
 * 新機能追加ではなく、本番相当接続と証拠付き検証が目的。
 */

export const AUTOMATION_E2E_FEATURE_EVALUATION = {
  機能名: "Automation E2E Reliability Verification",
  ユーザー価値:
    "一度設定した自動化を長期間安心して任せられることを、実測と証拠で証明する",
  差別化: "画面デモではなく Schedule→Run→Approval→外部→通知まで一本化検証",
  繰り返し作業の削減: "はい — 検証により運用不安と手動監視を減らす",
  AI必要度: "低（検証・計測はプログラム）。シナリオ内の生成は既存能力を呼ぶのみ",
  AIなしで実装可能: "はい — ハーネス・Schedule発火・idempotency・SecurityはAI不要",
  運営コスト: "検証時のみ。本番常時AI追加なし",
  外部APIコスト: "検証時にテストアカウント分のみ（未接続は成功扱いにしない）",
  コスト削減案: [
    "エコモード: 検証自体はAIを起動しない",
    "まとめて生成: 不要",
    "キャッシュ: Scheduleシミュレーションはメモリ上で再実行",
    "予約実行: 圧縮時刻で発火検証",
    "AI起動条件: 実外部E2E時のみ",
    "外部API最小化: 未接続はFAIL/BLOCKED、偽成功なし",
    "承認後実行: 高リスクは承認必須を検証",
    "同じ処理を再生成しない: idempotency/occurrence検証",
  ],
  優先度: "P0",
} as const;
