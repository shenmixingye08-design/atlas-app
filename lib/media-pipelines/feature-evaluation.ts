/**
 * 【ATLAS機能評価】
 *
 * 機能名：画像種別専用Pipeline基盤 + レシート家計簿
 * ユーザー価値：レシートを送るだけで家計簿登録・Excel・月次分析まで秘書が完了する
 * 差別化：Vision判定で通常成果物生成へ流さず Receipt Pipeline へ分岐。確認は低信頼のみ
 * 繰り返し作業の削減：はい
 * AI必要度：中 — 画像種別判定・抽出のみ Vision。分類学習・集計・提案は通常プログラム優先
 * AIなしで実装可能：一部 — OCR/抽出はAI必須。集計・Excel・学習はAI不要
 * 運営コスト：画像1枚あたり Vision 1〜2回（分類+抽出）。キャッシュで再解析抑制
 * 外部APIコスト：OpenAI Vision（cheap tier）。失敗時は登録しない
 * コスト削減案：
 *   - エコモード：分類が高確度ファイル名なら抽出のみ
 *   - まとめて生成：複数レシートを1 Excel
 *   - キャッシュ再利用：content hash
 *   - 予約実行：月次分析は閲覧時計算
 *   - AI起動条件：image/* かつ receipt 分岐時のみ
 *   - 外部API最小化：集計・提案はルール
 *   - 承認後実行：低信頼項目のみ確認後に本登録
 *   - 同じ処理を再生成しない：hash + entry id
 * 優先度：P0
 */
export const RECEIPT_PIPELINE_EVALUATION = {
  name: "receipt-household-ledger-pipeline",
  priority: "P0",
  maxImagesPerRequest: 8,
  maxImageBytes: 8 * 1024 * 1024,
} as const;
