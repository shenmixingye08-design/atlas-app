# Scheduler Production Trust — Report

Branch: `cursor/scheduler-production-trust-83f5`  
Base: `cursor/scheduler-queue-worker-prod-83f5`（既存 work-queue を拡張。新機能追加なし）

## 【ATLAS機能評価】

```
機能名：Scheduler Production Trust
ユーザー価値：毎日9:00等が取りこぼしなく動き、手作業の再確認が減る
差別化：History/Lease/Recovery/Metrics/100回実測で「動く」ではなく「信用できる」
繰り返し作業の削減：はい
AI必要度：不要
AIなしで実装可能：はい
運営コスト：低（cron tick 内の通常処理）
外部APIコスト：無
コスト削減案：エコモードN/A / キャッシュ=occurrence dedupe / 予約実行=本機能 /
  AI起動なし / 外部API最小化 / 承認後実行は既存維持 / 再生成禁止=unique occurrence
優先度：P0
```

## 1–9 実装対応

| # | 項目 | 状態 |
|---|---|---|
| 1 Scheduler | work-queue enqueueDueAutomations + tick | あり |
| 2 Queue | atlas_work_queue_jobs / file store | あり |
| 3 Worker | lease / heartbeat / drain | あり |
| 4 Lease | acquire / renew / expire / reclaim | あり |
| 5 Recovery | recoverStuckJobs | あり |
| 6 Metrics | alive / rates / avg / p95 / p99 / busy | 拡張済み |
| 7 Monitoring | Owner `/owner/scheduler` | 配線済み |
| 8 Dashboard | WorkQueuePanel | 配線済み |
| 9 Alert | stopped / backlog / worker / success&lt;95% | 拡張済み |

## 10 100回実測

- テスト: `work-queue scheduler accuracy 100 fires`
- 成果物: `/opt/cursor/artifacts/scheduler-production/scheduler-100-proof.json`
- 予定時刻 / 実行時刻 / 遅延 / 成功 / 失敗 / 平均 / P95 / P99 を記録
- **注:** in-process 証明。ライブ Vercel+DB 100回は残課題（ops）

## 11 負荷試験

100 / 500 / 1000 / 5000 — `work-queue load`（artifact 出力あり）

## Capabilities（正直な未実装）

| 能力 | 状態 |
|---|---|
| 毎日 / 毎週 / 毎月 | supported |
| Timezone / DST | supported（回帰テストあり） |
| Cron SoT | partial（保存のみ） |
| 毎分 / 毎時 | **unsupported（未実装）** |
| 休日除外 | **unsupported（未実装）** |
| 営業日 | partial（weekdays のみ） |

## Fail Closed

`ENABLE_SCHEDULED_CRON=false` または explicit stop 時、schedule/automation trigger の `completed` を拒否。

## 残課題

1. 本番 Supabase migration 適用
2. GitHub Actions minute scheduler secrets
3. ライブ Vercel cron 100回実測
4. minutely/hourly/holiday（新機能のため本PR対象外）
