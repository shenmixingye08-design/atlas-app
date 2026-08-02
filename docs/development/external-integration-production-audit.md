# External Integration Production — 接続監査

| サービス | 分類 | 備考 |
|---|---|---|
| Google Drive | 実接続 (live) | OAuth + upload。従来の生成後uploadはfail-openだった → Fail Closed へ |
| Dropbox | 実接続 (live) | OAuth + upload/share。deliverable auto-upload未登録だった |
| X | 実接続 (live) | TweetID + fetch-back。既に fail-closed 寄り |
| WordPress | 実接続 (live) | Application Password + post ID/link |
| Gmail | 実接続 (live) | send/draft message id |
| Google Calendar | 実接続 (live) | event id / htmlLink |
| LINE | 実接続 (live) | Messaging API |
| Supabase Storage | 実接続 (live) | バックエンド成果物保存 |
| Slack | 途中実装 (partial) | Registry/UIのみ |
| Discord | 途中実装 (partial) | Registryのみ |
| Webhook | 途中実装 (partial) | 受信あり・汎用outbound未本番 |
| Notion | mock | Stub connect |
| Outlook | 未接続 (unwired) | coming_soon |
| Teams | 未接続 (unwired) | coming_soon |
| Cloudflare R2 | 未接続 (unwired) | 実装なし |
| S3 | 未接続 (unwired) | future commentのみ |

## 着手前の問題

- API/接続の存在 ≠ Automation Complete
- Drive upload 失敗でも automation completed になり得た
- 通知が内部URLのみで投稿URLを返さない場合があった
- 共通Adapter / 統一ConnectionStatus / 4xx非Retryが未整備
