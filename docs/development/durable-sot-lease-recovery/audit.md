# Phase 1-4 旧 Lease 経路監査（変更前）

| # | Flow | file | function | 保存先 | atomicity | restart | multi-worker | duplicate | zombie | prod |
|---|------|------|----------|--------|-----------|---------|--------------|-----------|--------|------|
| 1 | Job取得 | `lib/work-queue/worker.ts` / `queue-repository.ts` | `drainWorkQueue` → `claimDue` | `atlas_durable_jobs` lease cols | SKIP LOCKED | Yes | Yes | Low on claim | Orphan until expiry | Ready |
| 2 | Worker識別 | `worker.ts` | `drainWorkQueue` | `lease_owner` text | Local UUID | Owner yes / ID ephemeral | No durable roster | ID reuse risk | Silent death | Partial |
| 3 | Lease取得 | `queue-repository.ts` | `claimDue` | job `lease_owner/expires` | Atomic UPDATE | Yes | Yes | Low | No token fence | Partial |
| 4 | Lease更新 | `worker.ts` / `queue-repository.ts` | `heartbeat` | `heartbeat_at` + `lease_expires_at` | Owner WHERE | Yes | Yes | Continues on fail | High if reclaim | Partial |
| 5 | Lease解放 | `worker.ts` | `updateJob` null owner | job cols | Mixed (adapter TOCTOU) | Yes | Mixed | Abort orphans | Until expiry | Partial |
| 6 | Lease期限切れ | claim 内 | `lease_expires_at < now` | job col | Via claim | Yes | Yes | Reclaim race | Running+expired | Partial |
| 7 | Job再取得 | `claimDue` expired branch | same | job cols | Yes | Yes | Yes | Med–High | Dual workers | Partial |
| 8 | Worker停止検出 | `worker.ts` | `AbortSignal` | file workers only | N/A | Partial | No | Batch orphans | Undetected | Partial |
| 9 | Stuck判定 | `worker.ts` / `queue-repository.ts` | `recoverStuckJobs` / `listStuck` | heartbeat age | Read race | Yes | Unfenced | Overlap reclaim | NULL hb blind | Partial |
| 10 | Recovery開始 | `worker.ts` | `recoverStuckJobs` | job → retry_scheduled | Unfenced | Job yes | Race | Attempt bump | Old continues | Partial |
| 11 | Recovery完了 | `worker.ts` | `recordRecovery(true)` | in-process counters | Weak | Metrics no | Per-process | Inflated | Low | Partial |
| 12 | Recovery失敗 | `worker.ts` | dead_letter/failed | job terminal | Unfenced | Job yes | Race | Contended | Process zombie | Partial |

## Phase 1-2 未配線

`atlas_durable_leases` / `heartbeats` / `recovery_states` は CRUD のみで Worker 未接続。

## Phase 1-4 で閉じるギャップ

1. leaseToken + leaseVersion fencing
2. Heartbeat 失敗時の処理停止
3. Recovery 状態の DB 永続化
4. Stuck 閾値の設定化
5. Side-effect 確認付き Step 再開
6. Zombie 更新拒否
7. Graceful shutdown で未着手 Lease の短縮/解放
