# Phase 1-5 Durable SoT Production Cutover

## 【ATLAS機能評価】

機能名：Durable SoT Production Cutover（本番 SoT 一本化）

ユーザー価値：再起動・デプロイ・複数 instance でも仕事が消えず、誤成功しない

差別化：DB fail-closed。memory/file へ黙って逃げない

繰り返し作業の削減：はい — 消失リカバリの手作業を減らす

AI必要度：不要

AIなしで実装可能：はい

運営コスト：Postgres のみ

外部APIコスト：無

コスト削減案：エコモード該当なし / AIなし / Idempotency / Dual-write禁止 / Fail-closed

優先度：P0

## Feature Flag 最終値（Production）

| Flag | Value |
|------|-------|
| `ATLAS_DURABLE_SOT_ENABLED` | `true`（未設定も true） |
| `ATLAS_LEGACY_STORE_READ_ENABLED` | `false`（Production で再有効化不可） |
| `ATLAS_LEGACY_STORE_WRITE_ENABLED` | `false`（Production で再有効化不可） |

Production 判定: `NODE_ENV=production` **または** `VERCEL=1` **または** `ATLAS_DURABLE_SOT_CUTOVER=true`。

Production では legacy を環境変数で再有効化できない（fail-closed）。

## Production SoT

| Domain | SoT | Path |
|--------|-----|------|
| Run | `atlas_durable_runs` | `RunRepository` / TX |
| Job | `atlas_durable_jobs` | `JobRepository` / `DurableSotWorkQueueStore` |
| Queue | same jobs + claim | `DurableQueueRepository` |
| Lease / Heartbeat | durable leases/heartbeats + job fence cols | repos + adapter |
| Recovery | `atlas_durable_job_recoveries` | `DurableRecoveryOrchestrator` |
| Retry / Occurrence / Idempotency / Evidence | durable tables | dedicated repositories |

Factory: `lib/work-queue/store/index.ts` → Durable only in production.

## Dual write / mixed SoT / fallback

- Dual write: **禁止**（DB write 成功のみ成功）
- Mixed SoT: **禁止**
- Automatic legacy fallback: **禁止**（`LEGACY_FALLBACK_BLOCKED`）
- File SoT: tests only via `ATLAS_WORK_QUEUE_FORCE_FILE` + `ATLAS_LEGACY_STORE_WRITE_ENABLED`（non-prod）

## Migration

```ts
import { migrateLegacyWorkQueueToDurable, rollbackLegacyMigrationBatch } from "@/lib/persistence/durable-sot";

// dry-run
await migrateLegacyWorkQueueToDurable(pool, { dryRun: true });

// apply
const result = await migrateLegacyWorkQueueToDurable(pool, { dryRun: false });

// rollback batch by job ids
await rollbackLegacyMigrationBatch(pool, jobIds);
```

Rules:
- incomplete `running` / `leased` → `retry` + `manualReviewJobIds`（never completed）
- empty legacy table / missing table → safe empty completion
- checksum + counts in result

## Ops cutover

1. Apply SQL migrations (`20260803`…`20260805`) on target DB
2. Dry-run legacy migration; review counts / manual_review
3. Apply migration; verify checksums
4. Deploy with Durable DB URL (`DATABASE_URL` / `DURABLE_SOT_DATABASE_URL`)
5. Confirm logs: `CUTOVER_ENABLED`, no `LEGACY_FALLBACK_*` success
6. Rollback = explicit ops only (redeploy previous revision + restore DB); env cannot silently re-enable legacy in production

## Architecture gate

```bash
node scripts/ci/durable-sot-architecture.mjs
```

## Restart / multi-instance proofs

`lib/persistence/durable-sot/cutover/restart-proof.test.ts` (real Postgres):

- A–F restart cases
- 2 / 5 / 10 worker claim contention
- zombie stale update reject
- empty legacy migration dry-run
