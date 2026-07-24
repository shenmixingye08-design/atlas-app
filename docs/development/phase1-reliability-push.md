# MINERVOT Phase 1 — Reliability + Push Setup

## Supabase migrations (apply in SQL Editor)

Run in order:

1. `supabase/migrations/20260722_atlas_push_subscriptions.sql`
2. `supabase/migrations/20260722_atlas_automation_jobs.sql`

## Vercel environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `VAPID_PUBLIC_KEY` | Push | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Push | Server only — never expose to client |
| `VAPID_SUBJECT` | Push | `mailto:ops@your-domain.example` |
| `SUPABASE_SERVICE_ROLE_KEY` | Jobs + Push | Durable job queue writes |
| `CRON_SECRET` | Tick | Vercel Cron auth for `/api/automations/tick` |
| `ATLAS_OWNER_EMAILS` | Owner metrics | Comma-separated owner emails |

## Cron limitations (Hobby plan)

`vercel.json` runs `/api/automations/tick` **once daily** (00:00 UTC).

- **Retries**: `next_retry_at` is checked on every tick. Sub-hourly retry (1m/5m/15m) requires either **Pro hourly cron** or opportunistic triggers (signed-in client tick, owner manual tick).
- **Daily report 19:00 JST**: Only fires when tick runs during hour 19 in `Asia/Tokyo`. With daily cron at 00:00 UTC (09:00 JST), use hourly cron or client-side tick during evening for reliable delivery.

## Test push (Settings)

Settings → Notifications → Push → **テスト通知を送る**

## Owner metrics

`GET /api/owner/job-reliability` — 24h job success/fail/retry/recover/hang + push stats (owner-gated).

## 実機確認

Android/iPhone Web Push: **未確認** (requires HTTPS deploy + real device permission grant).
