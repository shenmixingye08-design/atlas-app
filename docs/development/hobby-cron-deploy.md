# Cron / スケジュール実行方針（分単位必須）

## 採用方式

| 環境 | `vercel.json` schedule | 理由 |
| --- | --- | --- |
| 本番（必須） | `* * * * *`（毎分） | 予定時刻 ±60秒 SLA |
| Preview | 同左 | 本番相当検証 |

**日次 cron（`0 0 * * *`）は禁止です。**  
Vercel Hobby は毎分 Cron を拒否するため、**Vercel Pro が必須**です。

参考テンプレート: `vercel.cron.pro.json`（内容は `vercel.json` と同一）。

## SLA

- Scheduler 間隔: 最低 1 分
- 予定開始: ±60 秒以内
- Due tick: `nextRunAt <= now` の未実行を毎回取得
- Worker: lease + heartbeat + 自動 recovery（restart / cold start / deploy 後も再取得）

## 認証

- `Authorization: Bearer $CRON_SECRET` または `x-cron-secret`
- Production: ATLAS Owner セッションも可
- `ENABLE_SCHEDULED_CRON=false` で緊急停止

## 手動検証

```bash
curl -X POST "$APP_URL/api/automations/tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Owner UI: `/owner/scheduler`（Queue / Running / Retry / P95 / Alerts）
