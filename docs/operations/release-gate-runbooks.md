# MINERVOT Release Gate Runbooks（Phase 7）

機械可読の正本は `lib/release-gate/runbooks.ts`（`RELEASE_GATE_RUNBOOKS`）。  
本ドキュメントは運用者が読むための索引です。

## 共通初動

1. `/owner/release-gate` で Critical / Kill Switch / Flag を確認
2. 必要なら対象 Kill Switch を ENGAGE（重大スイッチは `confirm=ENGAGE` + 理由）
3. `/status` の公開文言を更新（内部構成は書かない）
4. request_id / jobId / artifactId / externalActionId でログ検索
5. ユーザー案内は誤解のない定型文を使う
6. 復旧後は canary → 成功率監視 → 全面再開

## Runbook 一覧

| ID | タイトル |
|---|---|
| openai_outage | OpenAI障害 |
| vision_timeout | Vision timeout急増 |
| db_outage | DB障害 |
| storage_outage | Storage障害 |
| queue_stopped | Queue停止 |
| worker_stopped | Worker停止 |
| notify_outage | 通知障害 |
| x_outage | X投稿障害 |
| gmail_outage | Gmail障害 |
| calendar_outage | Calendar障害 |
| wordpress_outage | WordPress障害 |
| dropbox_outage | Dropbox障害 |
| stripe_outage | Stripe障害 |
| webhook_outage | Webhook障害 |
| auth_outage | 認証障害 |
| data_leak_suspected | データ漏洩疑い |
| mis_send | 誤送信 |
| duplicate_post | 重複投稿 |
| duplicate_charge | 重複課金 |
| artifact_corrupt | 成果物破損 |
| deploy_fail | 本番デプロイ失敗 |
| rollback_fail | rollback失敗 |

各項目の検知条件・影響・停止対象・調査・ログ・復旧・再発防止・ユーザー案内・エスカレーション・完了条件はコード上の Runbook オブジェクトを参照。

## 二者承認

次の Kill Switch 有効化は理由必須 + `confirm=ENGAGE`：

- `external_all`
- `billing`
- `openai_all`

運用上はオーナー以外の第二承認者確認を推奨（プロセス）。
