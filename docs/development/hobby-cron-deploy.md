# Hobby 環境での Cron / デプロイ方針

## 採用方式

Vercel の `vercel.json` は環境変数で Cron を条件分岐できません。  
そのため次の固定構成にします。

| 環境 | `vercel.json` の schedule | 理由 |
| --- | --- | --- |
| Hobby / Preview 向け（既定） | `0 0 * * *`（1日1回） | Hobby は毎分 Cron を拒否するため |
| Vercel Pro 移行後 | `* * * * *`（毎分） | 時刻精度に必要 |

**正式 Cron パス（Phase 2-2）:** `/api/internal/scheduler/tick`  
Secret: `SCHEDULER_CRON_SECRET`（互換: `CRON_SECRET` 〜2026-10-01）

Pro 移行時は `vercel.cron.pro.json` の内容を `vercel.json` に反映してください。

## 定期実行機能は削除しない

- 正式入口: `POST /api/internal/scheduler/tick`
- 旧 `/api/automations/tick` は deprecated（Production Cron secret では 410）
- 認証: `Authorization: Bearer $SCHEDULER_CRON_SECRET` または ATLAS Owner
- 無認証実行は不可

## Hobby での検証方法（Cron を待たない）

```bash
curl -X POST "$APP_URL/api/internal/scheduler/tick" \
  -H "Authorization: Bearer $SCHEDULER_CRON_SECRET"
```

分単位: GitHub Actions `.github/workflows/minute-scheduler.yml`（`ATLAS_APP_URL` + secret）

## ランタイムフラグ

- `ENABLE_SCHEDULED_CRON=false` → due 処理スキップ
- `SCHEDULER_ALLOW_PREVIEW_TICK=true` → Preview のみ明示許可（既定ブロック）
