# Phase 1-3 Queue · Run · Job Durable Migration

## 【ATLAS機能評価】

機能名：Run / Job / Queue を Durable Repository へ移行（process-memory 卒業）

ユーザー価値：再起動・デプロイでも仕事（Run/Job/Queue）が消えない

差別化：Queue 実装を DB SoT に固定し、file/memory fallback を本番経路から外す

繰り返し作業の削減：はい — 消失リカバリの手作業を減らす

AI必要度：不要

AIなしで実装可能：はい

運営コスト：Postgres のみ

外部APIコスト：無

コスト削減案：エコモード該当なし / AIなし / Idempotency で再実行コスト抑制 / 承認後実行は後続

優先度：P0

## 範囲

- **やる:** RunRepository / JobRepository / DurableQueueRepository、Transaction、Idempotency、Work Queue store の Durable 差し替え
- **やらない:** Worker/Scheduler/Automation ビジネスロジック、Memory/Vision/Notification/UI、Completion/Retry ロジック変更

## 実装要点

| 領域 | SoT | 経路 |
|------|-----|------|
| Run | `atlas_durable_runs` | `RunRepository`（create/update/get/complete） |
| Job | `atlas_durable_jobs` | `JobRepository` |
| Queue | 同一 jobs 行の投影 | `DurableQueueRepository` |
| Create | TX | `createRunJobQueueTransaction`（Occurrence? → Run → Job → Queue） |
| Work Queue | Adapter | `DurableSotWorkQueueStore` ← `getWorkQueueStore()`（非 test / 非 FORCE_FILE） |

### Queue 状態（最低限）

`queued | leased | running | retry | completed | failed | cancelled | dead_letter`

（WorkQueueStore 互換のため `retry_scheduled` 等も DB 許可。Adapter で `retry` ↔ `retry_scheduled` をマップ）

### Idempotency（DB Constraint）

- Run: `idempotency_key` unique（partial）
- Job: `idempotency_key` / `run_id` / `(automation_id, occurrence_key)` unique
- Occurrence: `(automation_id, occurrence_key)` unique

### テスト

`lib/persistence/durable-sot/queue-migration.test.ts` — Run/Job/Queue CRUD、TX、Rollback、Duplicate、Concurrency、Unique、Repository surface
