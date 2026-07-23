/**
 * 【ATLAS機能評価】繰り返し仕事の実実行強化
 * Required before implementation — see docs/development/feature-evaluation-template.md
 */
export const RECURRING_WORK_EXECUTION_EVALUATION = {
  機能名: "繰り返し仕事の実実行強化（スケジュール起動・状態・履歴・リトライ・通知・X完全自動化）",
  ユーザー価値:
    "登録した繰り返し仕事が時刻どおりにAI秘書によって完了し、進捗と成果物を安心して確認できる",
  差別化:
    "スケジュール保存だけではない。時刻到来でエージェント起動→成果物生成→外部投稿まで完了し、失敗時は自動リトライする",
  繰り返し作業の削減: "はい — 投稿・文章生成・資料作成などの習慣作業を毎回手動で起動しなくてよい",
  AI必要度: "中 — 文章・画像・レポート生成のみAI。時刻判定・状態・履歴・リトライ・通知は通常プログラム",
  AIなしで実装可能:
    "一部 — cron/nextRun/状態遷移/履歴/通知/リトライは非AI。コンテンツ生成と投稿文作成はAI",
  運営コスト:
    "分単位cronでdueのみ実行。エコモード時はキャッシュ・まとめて生成を継続利用。同一tick slotは二重実行しない",
  外部APIコスト:
    "有 — OpenAI（生成時のみ）・X API（投稿ステップ有効時のみ）。失敗リトライ最大3回で上限固定",
  コスト削減案: [
    "エコモード: 既存executionModeを維持し、再生成を抑制",
    "まとめて生成: SNSバッチ日数設定を継続",
    "キャッシュ再利用: request-cacheを継続",
    "予約実行: nextRun + cron tickでdueのみ起動",
    "AI起動条件: dueかつenabledかつbilling許可かつclaim成功時のみ",
    "外部API最小化: 投稿ステップ有効かつ生成成功後のみX API",
    "承認後実行: 既存executionLevelを変更せず維持",
    "再生成禁止: tick-claim + nextRun予約で同一枠の再実行を防止",
  ],
  優先度: "P0",
} as const;
