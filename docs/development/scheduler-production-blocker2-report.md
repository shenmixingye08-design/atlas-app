# Scheduler Production Blocker #2 — 本番確実稼働レポート

## 【ATLAS機能評価】

機能名：Scheduler Production Blocker #2（本番確実稼働）  
ユーザー価値：毎分〜毎月の予定仕事が取りこぼし・重複なく完了する  
差別化：Cron SoT 統一 + Scheduler専用テーブル + Fail Closed + 100回連続実証  
繰り返し作業の削減：はい  
AI必要度：不要  
AIなしで実装可能：はい  
運営コスト：中（Postgres・GitHub Actions 分tick）  
外部APIコスト：無（Scheduler自体）  
優先度：P0

---

## Scheduler構成図

```
┌─────────────────────────────────────────────────────────────┐
│ Cron SoT: lib/work-queue/cron-sot.ts                        │
│  minute * * * * *  │ hourly 0 * * * * │ daily 0 0 * * *     │
└───────────────┬─────────────────┬───────────────┬───────────┘
                │                 │               │
     GitHub Actions          GitHub Actions    Vercel Hobby
     (minute + hourly)       (backup)          (daily only)
                │                 │               │
                └────────────┬────┘───────────────┘
                             ▼
              POST /api/automations/tick
                             │
              hydrateSchedulerGateFromStore()
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  enqueueDueAutomations   Worker drain      V2 due-tick
  (occurrence + lock)    (lease/heartbeat)  (parallel)
         │                   │
         ▼                   ▼
  atlas_scheduler_schedules + atlas_scheduler_execution_logs
  atlas_work_queue_jobs / steps / meta / side_effects
         │
         ▼
  Scheduled → Running → Completed / Failed
  (Fail Closed: Scheduler停止中は completed 禁止)
```

---

## Cron一覧（SoT）

| ID | Cron | Path | Provider |
|---|---|---|---|
| minute_due_tick | `* * * * *` | `/api/automations/tick` | GitHub Actions / Vercel Pro |
| hourly_due_tick_backup | `0 * * * *` | `/api/automations/tick` | GitHub Actions |
| daily_hobby_tick | `0 0 * * *` | `/api/automations/tick` | Vercel Hobby |

### Product presets（DB nextRun 評価）

| Preset | Cron template | Status |
|---|---|---|
| minutely | `* * * * *` | supported |
| hourly | `M * * * *` | supported |
| daily | `M H * * *` | supported |
| weekly | `M H * * D` | supported |
| monthly | `M H DOM * *` | supported |

CI gate: `npm run ci:cron-sot`（vercel.json / Actions / migration 一致検証）

---

## 100回実測結果

テスト: `lib/work-queue/scheduler-100-consecutive.test.ts`  
成果物: `artifacts/scheduler-production/scheduler-100-proof.json`  
（CI artifact 名: `scheduler-100-proof`）

| 指標 | 実測 |
|---|---|
| scenario | consecutive_enqueue_drain_x100_all_presets |
| total | 100 |
| success | 100 |
| failed | 0 |
| duplicates（ブロック済み再発火） | 100 |
| misses（取りこぼし） | 0 |
| successRate | 100% |
| failureRate | 0% |
| averageExecutionTimeMs | ~36ms |
| presetsCovered | minutely / hourly / daily / weekly / monthly |
| verdict | **pass** |

判定: `success === 100 && failed === 0 && misses === 0` → `verdict: pass`

実行コマンド:

```bash
npm run test:scheduler-100
```

---

## 失敗時の Recovery

| 障害 | 動作 |
|---|---|
| Worker crash mid-job | Heartbeat 期限切れ → `recoverStuckJobs` が re-queue（完了Stepは保持） |
| 429 / 5xx | `decideRetry` → `retry_scheduled` + 永続 retry_history |
| 重複 tick | `(automation_id, occurrence_key)` UNIQUE + idempotencyKey |
| Scheduler 停止 | `isSchedulerAcceptingCompletions` → schedule completed 禁止 |
| Lease 競合 | `FOR UPDATE SKIP LOCKED` / registry lock |
| Side-effect 再実行 | `atlas_work_queue_side_effects` UNIQUE |

状態遷移（Scheduler registry）:

`scheduled → running → completed|failed → scheduled`（次 occurrence）  
`stopped` 中は completed 不可。

---

## 本番運用方法

1. **Migrations**  
   `20260802` → `20260803` → `20260804_atlas_scheduler_registry.sql` を本番 Postgres に適用。

2. **Secrets**  
   - `DATABASE_URL`（必須 — file SoT 禁止）  
   - `CRON_SECRET`  
   - `ATLAS_APP_URL`（GitHub Actions 分tick用）

3. **Tick**  
   - Hobby: Vercel daily + GitHub Actions minute/hourly  
   - Pro: `vercel.cron.pro.json` の `* * * * *` を vercel.json に反映可

4. **監視**  
   Owner `/owner/scheduler` — queue metrics / capabilities / alerts

5. **停止**  
   `ENABLE_SCHEDULED_CRON=false` または durable meta `scheduler_explicitly_stopped`  
   → schedule-triggered `completed` は Fail Closed

6. **証明の再実行**  
   `npm run test:scheduler-100` → `scheduler-100-proof.json` を確認
