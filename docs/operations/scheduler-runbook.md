# Scheduler Production Runbook (Phase 2-5)

正式経路: `POST /api/internal/scheduler/tick`  
Health: `GET/POST /api/internal/scheduler/health`  
Owner Dashboard: `/owner/scheduler`  
Owner Metrics: `GET /api/owner/work-queue/metrics`（`ops` / `health` / `alerts`）

Secret: `SCHEDULER_CRON_SECRET`（互換 `CRON_SECRET` 〜2026-10-01）

---

## Scheduler停止

**症状:** `Running=NO` / Alert `scheduler_stopped` / `alive=false`

**確認**
1. Owner `/owner/scheduler` → Health
2. `ENABLE_SCHEDULED_CRON` が `false` になっていないか
3. `SCHEDULER_CRON_SECRET` configured（値は見ない）
4. Vercel Cron / GH Actions minute-scheduler の直近実行

**復旧**
1. `ENABLE_SCHEDULED_CRON` を削除または `true`
2. Secret を再設定（rotate 時は Vercel + GH Secrets 同時）
3. 手動: `POST /api/internal/scheduler/tick` with Bearer secret
4. Due backlog / Oldest Due が減少することを確認

**Rollback:** 緊急時は `ENABLE_SCHEDULED_CRON=false`（completed 禁止が働く）

---

## Queue停止

**症状:** Alert `queue_disabled` / Outbox pending 増加 / Miss

**確認**
1. `SCHEDULER_BRIDGE_QUEUE_DISABLED`
2. Owner Metrics → Queue / Outbox Pending / Miss Count
3. DB `atlas_work_queue_jobs` または file store

**復旧**
1. kill switch を解除
2. tick 再実行（Outbox retry が enqueue）
3. Queue Length / Oldest Job を確認

---

## Worker停止

**症状:** Alert `worker_stopped` / leased|running があるのに workerCount=0

**確認**
1. `/api/worker/drain` または tick 内 `drainWorkQueue`
2. stuck / heartbeat

**復旧**
1. Worker drain を実行（formal tick または drain API）
2. stuck は `recoverStuckJobs`（tick/drain 経路）
3. Recovery Count / Success Rate を確認

---

## Recovery

1. Alert `recovery_failed` または stuck > 0
2. drain / tick で reclaim
3. `recoverySuccessRate` が改善するまで監視
4. Dead Letter は手動調査（再生成禁止の原則を守る）

---

## Rollback

| 段階 | 操作 |
|------|------|
| Soft stop | `ENABLE_SCHEDULED_CRON=false` |
| Dispatcher stop | `SCHEDULER_BRIDGE_DISPATCHER_DISABLED=true` |
| Queue stop | `SCHEDULER_BRIDGE_QUEUE_DISABLED=true` |
| Route rollback | 前バージョンへ deploy（formal path 維持推奨） |
| Secret rollback | 旧 `CRON_SECRET` compat（期限まで） |

---

## Migration

1. `supabase/migrations/20260802_atlas_work_queue.sql`
2. `supabase/migrations/20260803_atlas_scheduler_core.sql`
3. Production で apply 後、health `store` が down でないこと
4. Preview と Production の DB を混ぜない

---

## Secrets

| Name | Where |
|------|--------|
| `SCHEDULER_CRON_SECRET` | Vercel Production + Preview（Preview tick は別途 allow） |
| `CRON_SECRET` | 互換のみ |
| `ATLAS_APP_URL` | GitHub Actions secrets（minute scheduler） |
| GH `SCHEDULER_CRON_SECRET` | `.github/workflows/minute-scheduler.yml` |

値は Dashboard に出さない（configured/missing のみ）。

---

## Cron

| Surface | Schedule | Path |
|---------|----------|------|
| `vercel.json` | `0 0 * * *`（Hobby） | `/api/internal/scheduler/tick` |
| `vercel.cron.pro.json` | Pro 用 | 同上 |
| GH Actions | `* * * * *` | 同上 + secret |

Cron 停止時: Actions disable または secret 削除 → Alert `scheduler_stale` を監視。
