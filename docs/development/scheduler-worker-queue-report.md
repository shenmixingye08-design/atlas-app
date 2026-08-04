# Scheduler・Worker・Queue Productionization — Report

Branch: `cursor/scheduler-worker-queue-4b7a`  
Evaluation: `docs/development/scheduler-worker-queue-evaluation.md`

## 1. 現行監査（要約）

| 項目 | 分類 |
|---|---|
| Schedule model / nextRunAt | 部分実装 |
| due tick / Cron route | 部分実装→本番経路へ置換 |
| Vercel Cron | 日次のみ（Hobby制約） |
| Queue | process memory依存 → **永続化** |
| Worker | 同期実行 → **独立drain** |
| Lease / Heartbeat / Stuck | 未接続/部分 → **実装** |
| Retry / Recovery | 部分 → **Step単位+stuck recovery** |
| Idempotency / occurrence | 部分 → **unique制約相当** |

## 2–3. Queue選定

**採用:** PostgreSQL / Supabase `atlas_work_queue_jobs` + `SKIP LOCKED`  
**試験/ローカル:** ファイル永続ストア（再起動耐性あり）  
**不採用:** pg-boss（長時間プロセス）, Inngest/Trigger/QStash（有料新規）, Bull/Redis（未導入）, process memory（禁止）

## 4–13. 構成

- Scheduler: `enqueueDueAutomations` — occurrence作成・enqueue・nextRun再計算のみ
- Worker: `drainWorkQueue` + `/api/worker/drain` — lease→step実行→heartbeat
- Job model: migration `20260802_atlas_work_queue.sql`
- 状態遷移: `WORK_JOB_TRANSITIONS` in `lib/work-queue/types.ts`
- Lease: atomic status→leased + leaseOwner/Expires
- Heartbeat: interval延長
- Retry: exponential+jitter, retryable分類
- Recovery: stuck→retry_scheduled（完了Step保持）
- Idempotency: occurrenceKey / job / step keys
- Pause/Resume/Cancel: pauseは候補除外、resumeは未来nextRun、cancel API helper

## 分単位

- GitHub Actions: `.github/workflows/minute-scheduler.yml` (`* * * * *`)
- Vercel Hobby: 日次フォールバック維持
- Pro: `vercel.cron.pro.json` を利用可能

## 試験結果（ローカル・ファイル永続）

| 試験 | 結果 |
|---|---|
| Scheduler 100発火 | enqueued=100, deduped=100(再tick), avgDelay≈7950ms, p95=11000ms, p99=11000ms, max=11000ms |
| 100 Jobs | completed=100 |
| 500 Jobs | completed=500 |
| 1000 Jobs ×5 workers | completed=1000 |
| Step retry (upload fail) | generate再実行なし |
| Lease concurrency | duplicate lease 0 |
| Process restart | queued存続→完了 |
| Stuck recovery | completed steps保持 |

## ゲート

- TypeScript: 0
- Lint: 0
- Test: 1044 passed
- Build: unconditional PASS（connection()）
- CI: Quality Gate + work-queue critical path

## 未対応 / Critical

- 本番Supabaseへのmigration適用は運用作業（SQL Editor / migration action）
- GitHub Secrets `CRON_SECRET` + `ATLAS_APP_URL` 設定が分単位発火に必須
- Vercel Hobbyではネイティブ分Cron不可（Actionsで代替）
- V2 live external adaptersは未配線（本Phase対象外の既存制約）
- 「本番ライブE2E（実Vercel+実DB）」はこの環境では未接続のため、**予定時刻の本番信用は CONDITIONAL**

## ロールバック

```bash
git revert <merge-commit>
# + drop tables atlas_work_queue_steps / atlas_work_queue_jobs if applied
```

## 判定

- Phase: 実装・試験・CIは PASS 条件の大半を満たす
- 予定時刻を本番で信用できる: **NO（厳格）** — 理由: 分単位は Actions Secrets 依存、Postgres migration未適用環境ではfile store、本番ライブ100回は未実測
