# Hobby 環境での Cron / デプロイ方針

## 採用方式

Vercel の `vercel.json` は環境変数で Cron を条件分岐できません。  
そのため次の固定構成にします。

| 環境 | `vercel.json` の schedule | 理由 |
| --- | --- | --- |
| Hobby / Preview 向け（既定） | `0 0 * * *`（1日1回） | Hobby は毎分 Cron を拒否するため |
| Vercel Pro 移行後 | `* * * * *`（毎分） | X定期投稿の時刻精度に必要 |

Pro 移行時は `vercel.cron.pro.json` の内容を `vercel.json` に反映してください。

## 定期実行機能は削除しない

- `/api/automations/tick` 本体・二重実行防止・idempotency は維持
- 認証: `Authorization: Bearer $CRON_SECRET` または ATLAS Owner セッション
- 無認証実行は不可

## Hobby での検証方法（Cron を待たない）

1. Owner でログイン
2. `POST /api/automations/tick` を手動実行（Owner セッション、または `CRON_SECRET`）
3. 単体/統合テストで次回日時計算・ロック・再試行・通知を検証

```bash
# ローカル / Preview（Owner セッション Cookie 付き）
curl -X POST "$APP_URL/api/automations/tick"

# または秘密鍵
curl -X POST "$APP_URL/api/automations/tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Pro 変更後に有効化する設定

1. Vercel を Pro にアップグレード
2. `vercel.json` の schedule を `* * * * *` に変更（`vercel.cron.pro.json` 参照）
3. Production に `CRON_SECRET` を設定
4. 再デプロイ後、指定時刻の本番 Cron 実行だけを確認

## ランタイムフラグ（任意）

`ENABLE_SCHEDULED_CRON=false` のとき、tick は認証成功後も due 自動処理をスキップし、  
`{ skipped: true, reason: "ENABLE_SCHEDULED_CRON=false" }` を返します。  
手動検証や Preview で誤実行を抑えたい場合に使います（既定は有効）。
