# Scheduler Core Unification — Phase 2-2

## 【ATLAS機能評価】

```
機能名：Scheduler Core Unification（2-2）
ユーザー価値：約束した時刻の仕事が漏れず二重にならず、手動再tickが減る
差別化：入口・認証・nextRunAt・due・occurrence・HistoryをDurable上の1本に統一
繰り返し作業の削減：はい
AI必要度：不要
AIなしで実装可能：はい
運営コスト：低
外部APIコスト：無
コスト削減案：occurrence unique / Outbox / tick内成果物生成なし / 承認後=既存
優先度：P0
```

## Formal path

`POST /api/internal/scheduler/tick`

Cron: `vercel.json`, `vercel.cron.pro.json`, `.github/workflows/minute-scheduler.yml`

Deprecated: `POST /api/automations/tick` — Production + cron secret → **410**; Owner/non-prod → same `runSchedulerCoreTick` (UI unchanged, no redirect).

## Secret

- Primary: `SCHEDULER_CRON_SECRET` (runtime required, build not required)
- Compat until **2026-10-01**: `CRON_SECRET`
- timing-safe, fail-closed 503 when missing (non-owner)
- Health/env-status: configured/missing only

## nextRunAt

`calculateNextRunAt` in `lib/scheduler-core/calculate-next-run-at.ts`  
V1 `computeNextRun*` and V2 `computeNextRunFromSchedule` delegate to it.  
Advance basis: **scheduledAt** (+1ms) via Outbox (delay does not accumulate).

## Due / Index / Occurrence / TX / Outbox

- Index table `atlas_scheduler_schedules` + due index
- Occurrence key: `occ:automationId:tz:YYYYMMDDHHmm` (unique with work-queue)
- Per due: enqueue job (unique) → outbox → history link → dispatch outbox → nextRun
- No memory SoT fallback (Postgres or test file store)

## Misfire

Default `run_once_immediately`; also `skip_missed`, `catch_up_limited` (limit 1).

## Preview

Blocked unless `SCHEDULER_ALLOW_PREVIEW_TICK=true`.

## Health

`GET/POST /api/internal/scheduler/health` (secret or Owner).
