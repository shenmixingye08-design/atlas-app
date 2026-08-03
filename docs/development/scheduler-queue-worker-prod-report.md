# Scheduler · Queue · Worker Production Ready — Report

Branch: `cursor/scheduler-queue-worker-prod-83f5`

## 【ATLAS機能評価】

See `lib/work-queue/feature-evaluation.ts`.

## Architecture (no parallel SoT)

| Layer | Role |
|---|---|
| `lib/work-queue/*` + `atlas_work_queue_jobs` | Durable enqueue / lease / worker / DLQ |
| `/api/automations/tick` | Minute-capable due tick (enqueue + drain) |
| `/api/worker/drain` | Independent worker drain |
| `.github/workflows/minute-scheduler.yml` | Production minute path (Hobby-safe) |
| `vercel.json` | Daily fallback (Hobby) |
| `vercel.cron.pro.json` | Pro minute cron template |

## Guarantees

1. Scheduler enqueues only (occurrenceKey dedupe)
2. Worker leases with heartbeat / expire / reclaim
3. Retry: exponential + jitter, classified errors, DLQ on exhaustion
4. Completion: **all steps + evidence** or **FAILED** (no mid-success completed)
5. Fail closed: sandbox/mock notify forbidden; storage/notify failures fail the job

## Tests

- Unit: lease, retry, stuck recovery, restart, fail-closed, graceful shutdown
- Load: 100 / 500 / 1000 / **5000** jobs
- Scheduler: 100 fires + dedupe

## Remaining ops (not code)

1. Apply `supabase/migrations/20260802_atlas_work_queue.sql` in production
2. Set GitHub secrets `CRON_SECRET` + `ATLAS_APP_URL` for minute Actions
3. Branch-protection: require Quality Gate check
