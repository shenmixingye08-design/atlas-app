/**
 * 【ATLAS機能評価】P0-7 Document Generation Pipeline
 *
 * 機能名：文書生成パイプラインの統一 Durable 化（DOCX/XLSX/PDF/PPTX/TXT/MD）
 * ユーザー価値：途中停止・成果物なしcompleted・画面経路差による失敗をなくし、必ずダウンロードできる
 * 差別化：全形式が同一 Pipeline（Generate→Export→Artifact→Evidence→Notify→Download）
 * 繰り返し作業の削減：はい（再生成・再ダウンロード・経路差の手直しを削減）
 * AI必要度：不要（本P0はパイプライン永続化・完了ゲート。文章生成は既存）
 * AIなしで実装可能：はい
 * 運営コスト：低（既存 Storage/DB + pipeline job 行）
 * 外部APIコスト：なし（新規外部APIなし）
 * コスト削減案：
 *   - エコモード: N/A
 *   - まとめて生成: 1リクエストで要求形式を一括 generateDeliverables
 *   - キャッシュ: artifact checksum / completion evidence
 *   - 予約実行: N/A（同期 work-job 内）
 *   - AI起動条件: 変更なし
 *   - 外部API最小化: N/A
 *   - 承認後実行: 既存 contentAlreadyApproved
 *   - 再生成禁止: completed は verified evidence 必須
 * 優先度：P0
 */
export const P0_7_FEATURE_EVALUATION = {
  name: "P0-7 Document Generation Pipeline",
  priority: "P0" as const,
};
