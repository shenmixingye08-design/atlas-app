# MINERVOT Production Runbook（1000人運用）

## 目的

1000人が同時利用してもサービス停止しないための障害対応手順。

## 観測の入口

1. Owner → **Production (1000)** (`/owner/production`)
2. Public health
   - `GET /api/health/live` — プロセス生存
   - `GET /api/health/ready` — 依存関係 Ready
   - `GET /api/health/production` — API/Storage/Supabase/Worker/Queue/Cron/OpenAI
3. Correlation headers: `x-correlation-id`, `x-request-id`, `x-atlas-run-id`, `x-atlas-job-id`, `x-atlas-artifact-id`, `x-atlas-diagnostic-id`

## 監視（最低ライン）

| Monitor | 意味 | 初動 |
|---|---|---|
| queue_backlog | Queue滞留 | Self-heal queue / tick確認 |
| worker_pressure | Memory圧迫 | スケール/負荷制限 |
| failure_spike | Failure急増 | 回路遮断・OpenAI/DB確認 |
| retry_spike | Retry急増 | 下流障害切り分け |
| storage_fault | Storage障害 | Blob/Supabase確認 |
| openai_fault | OpenAI障害 | 回路・キー・予算 |
| db_fault | DB障害 | Supabase status |
| notification_fault | 通知失敗 | Push/LINE/Webhook |
| scheduler_stop | Cron停止 | GitHub Actions / Vercel cron |

## Alert チャネル

Env（設定時のみ送信・5分クールダウン）:

- `ATLAS_ALERT_SLACK_WEBHOOK_URL`
- `ATLAS_ALERT_DISCORD_WEBHOOK_URL`
- `ATLAS_ALERT_EMAIL_WEBHOOK_URL` (+ `ATLAS_ALERT_EMAIL_TO`)
- `ATLAS_ALERT_WEBHOOK_URL`

Owner画面の **Test alert** で疎通確認。

## 復旧

1. `/owner/production` → **Self-heal queue**（DR queue drain + retry）
2. `/owner/disaster-recovery` → fallback / restore
3. Graceful shutdown: Node SIGTERM/SIGINT で受付停止フラグ
4. それでも不可 → Maintenance mode（system-status）

## Backup / Restore

1. Owner Production → **Backup checkpoint** または Disaster Recovery → backup
2. 対象: DB durable domains / Automation / Memory / Notifications / Billing / Settings / Artifact metadata
3. Restore は DR 画面から。破壊的操作はOwnerのみ。
4. 四半期ごとに Restore drill を実施（`restoreDrillRequired: true`）

## Rate Limit

- user: 120/min
- ip: 300/min
- automation: 60/min
- 既存 AI hourly limit も併用

※現状はプロセス内。マルチインスタンス本格対応は Redis が次段。

## 負荷試験

```bash
npx vitest run lib/production/load-chaos.test.ts
```

100 / 500 / 1000 同時仮想ユーザーの in-process stress + chaos recovery。

## エスカレーション

1. Production dashboard で該当 monitor
2. Audit log で直近失敗
3. Reliability / Error monitoring
4. Alert webhook / Slack
