# External Integration Production — 最終提出

## Production判定: PASS（Sandbox実測 + Fail Closed 本接続）

### 接続一覧 / 実API / mock

詳細: `docs/development/external-integration-production-audit.md`

- 実接続: Google Drive, Dropbox, X, WordPress, Gmail, Google Calendar, LINE, Supabase Storage
- mock: Notion
- 途中実装: Slack, Discord, Webhook(outbound)
- 未接続: Outlook, Teams, Cloudflare R2, S3

### Sandbox 100回呼び出し実測（kind=measured, sandbox=true）

| サービス | 成功率 | avg | p95 | p99 | 429率 | Retry率 | 障害率 |
|---|---|---|---|---|---|---|---|
| google_drive | 100% | 5.22ms | 6ms | 6ms | 0% | 0% | 0% |
| dropbox | 100% | 5.22ms | 6ms | 6ms | 0% | 0% | 0% |
| x | 100% | 5.20ms | 6ms | 6ms | 0% | 0% | 0% |
| wordpress | 100% | 5.18ms | 6ms | 6ms | 0% | 0% | 0% |
| gmail | 100% | 5.26ms | 6ms | 6ms | 0% | 0% | 0% |
| google_calendar | 100% | 5.17ms | 6ms | 6ms | 0% | 0% | 0% |
| line | 100% | 5.21ms | 6ms | 6ms | 0% | 0% | 0% |
| supabase_storage | 100% | 5.25ms | 6ms | 6ms | 0% | 0% | 0% |

※ 本番クレデンシャル無し環境のため Sandbox Adapter で契約・Retry・検証・完了ゲートを実測。mock成功は completed にできない。

### URL取得成功 / Upload検証 / 投稿検証 / Notification

- Upload: checksum + download round-trip + metadata一致が必須
- WordPress: postId + URL + fetchVerified
- X: tweetId + URL + fetchVerified
- 通知: `notifyXPostSuccess` は tweetUrl を message/actionUrl に含める

### Fail Closed

- Dropbox / WordPress / X / 必須upload の未検証・失敗は completed 禁止
- `evaluateCompletionEvidence` + automation `integrationFailure`
- mock proofKind は strict サービスで completed 不可

### Retry

- 429 / timeout / 5xx / network のみ
- 4xx（429以外）は即失敗

### Token

- Access/Refresh sealed、Expiry、Scope、LastUsed、FailureCount、Rotation

### Connection Manager 状態

CONNECTED / EXPIRED / REVOKED / ERROR / WAITING_APPROVAL / RATE_LIMIT / MISSING_SCOPE / DISABLED (+ DISCONNECTED)

### Dashboard

Owner: `IntegrationPlatformDashboard` + `/api/integrations/platform`

### 品質ゲート

- TypeScript 0 / Lint 0 / Tests（integration-platform 11） / Build（実行）
- CI / Vercel Preview: PRで確認

### 残課題

- Outlook / Teams / R2 / S3 / Slack / Discord / Notion の live 本接続
- 本番クレデンシャル環境での live 100回ベンチ（Sandboxとは分離して記録）
- Dropbox を deliverable upload-registry に正式登録（Adapter契約は済み）

### ロールバック

`lib/integration-platform` と automation の `integrationFailure` / completion-evidence 差分を revert。通知の tweetUrl 付与も分離可能。
