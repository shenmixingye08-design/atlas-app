/**
 * 【ATLAS機能評価】
 *
 * 機能名：P06 End-to-End 運用検証（画像→解析→全形式成果物→通知→履歴→DL→再DL→リトライ）
 * ユーザー価値：途中停止ゼロ。失敗時も途中成果物を残し、自動再試行で仕事を完了させる
 * 差別化：ユーザー向けエラー画面を禁止し、状態表示＋自動リトライ＋開発者ログ（原因/再現/修正）
 * 繰り返し作業の削減：はい（再依頼・再入力・途中やり直しの習慣作業を削減）
 * AI必要度：低（状態表示・リトライ・永続化は通常プログラム。画像理解のみ既存 AI）
 * AIなしで実装可能：一部（進捗/リトライ/通知/履歴は AI 不要）
 * 運営コスト：低（既存 durable store + withRetry + developer-log）
 * 外部APIコスト：既存 Vision/生成のみ。本フェーズで新規外部 API なし
 * コスト削減案：
 *   - エコモード: 既存エコモードを変更しない
 *   - まとめて生成: 1 pipeline で docx/xlsx/pdf/pptx を一括
 *   - キャッシュ再利用: durable artifact / cold re-download（再生成しない）
 *   - 予約実行: N/A（同期 E2E 検証）
 *   - AI起動条件: 画像解析が必要なときだけ Vision
 *   - 外部API最小化: mock LLM で検証、本番は失敗時のみ再試行
 *   - 承認後実行: 既存 contentAlreadyApproved を維持
 *   - 同じ処理を再生成しない設計: 成功済み形式は保持、再DLは同一 artifact
 * 優先度：P0（運用検証ゲート）
 */
export const P06_E2E_OPS_FEATURE_EVALUATION = {
  name: "P06 End-to-End Ops Verification",
  priority: "P0" as const,
};
