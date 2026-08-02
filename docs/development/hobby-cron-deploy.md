# Cron / スケジュール実行方針（分単位必須）

## 採用方式

| 経路 | schedule | 用途 |
| --- | --- | --- |
| **GitHub Actions** `.github/workflows/minute-scheduler-tick.yml` | `* * * * *` | **本番の正**（Hobbyでも毎分） |
| Vercel Cron（Pro移行後） | `vercel.cron.pro.json` → `vercel.json` | 冗長の二重tick（idempotent） |

`vercel.json` の `crons` は Hobby デプロイ互換のため空です。  
**日次 cron のみでの運用は禁止**です。

## 必要 Secrets（GitHub）

- `CRON_SECRET` — tick 認証
- `APP_URL` — 例: `https://atlasapp.jp`

## SLA

- Scheduler 間隔: 最低 1 分
- 予定開始: ±60 秒以内
- Due tick: `nextRunAt <= now` の未実行を毎回取得
- Worker: lease + heartbeat + 自動 recovery

## 手動検証

```bash
curl -X POST "$APP_URL/api/automations/tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Owner UI: `/owner/scheduler`
