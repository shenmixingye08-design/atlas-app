# Durable Queue / Worker / Scheduler Reliability — Phase Report

Branch: `cursor/durable-queue-scheduler-83f5`  
Base: `main` @ `6bfc26e`

## 【ATLAS機能評価】

```
機能名：Durable Queue / Worker / Scheduler Reliability
ユーザー価値：毎週月曜9時の仕事が再起動・crash・一時障害でも重複も消失もなく完了する
差別化：永続Queue + atomic Lease + Heartbeat + Step resume + 永続Idempotency
繰り返し作業の削減：はい
AI必要度：不要
AIなしで実装可能：はい
運営コスト：中（Postgres・GitHub Actions 分tick）
外部APIコスト：なし（Queue自体）
コスト削減案：Schedulerはenqueueのみ / occurrence+side-effect unique /
  AIは成果物Step到達時のみ / 承認後実行維持 / 再生成禁止
優先度：P0
```

## Phase判定

**CONDITIONAL FAIL**

理由（受け入れ条件未達）:

1. **本番相当 Preview/Vercel 上の 100 Occurrence 実測は未実証**（in-process + CI Postgres のみ）
2. **main 未マージ**（本PR時点）
3. GitHub Actions minute secrets（`CRON_SECRET` / `ATLAS_APP_URL`）と本番 migration 適用は **ops 依存・未確認**
4. 祝日・営業日除外は **未対応**（成功扱いしない）
5. V1 Automation 定義のランタイム SoT は依然 memory+hydrate（Job は Postgres）

コード上の信頼性担保（Queue/Lease/Heartbeat/Recovery/Idempotency）は実装・CI で検証済み。  
**「予定実行を信用できる」= NO（本番ライブ実測まで）**  
**「Crash後も仕事が失われない」= YES（Postgres SoT + lease reclaim 時）/ NO（本番で file fallback や migration 未適用時）**

---

## 1. 現行Scheduler監査（main）

| 項目 | 分類 | 証拠 |
|---|---|---|
| schedule保存 | 部分実装 | `ServerAutomationRepository` + durable hydrate |
| nextRunAt計算 | Production実装 | `lib/automations/schedule.ts` `computeNextRunIso` |
| due tick | Production実装（配線） | `POST /api/automations/tick` → `processWorkQueueTick` |
| occurrence | Production実装 | `buildOccurrenceKey` + unique `(automation_id, occurrence_key)` |
| Run作成 | 部分実装 | work-queue 内 `runId` mint（独立 Run テーブルなし） |
| Job作成 | Production実装 | `atlas_work_queue_jobs` |
| Queue投入 | Production実装 | `enqueueDueAutomations`（成果物生成なし） |
| 分単位 | 部分実装 | Actions `minute-scheduler.yml`（secrets必要）。Vercel Hobby は日次のみ |
| setInterval Scheduler | 禁止遵守 | heartbeat のみ（worker） |

## 2. 現行Queue監査

| 項目 | 分類 |
|---|---|
| Postgres store | Production実装（`SKIP LOCKED`） |
| File fallback | テスト/明示許可のみ。**本番は Postgres 必須（fail-closed）** |
| process memory Queue | 禁止（本番） |

## 3. 現行Worker監査

| 項目 | 分類 |
|---|---|
| `/api/worker/drain` | Production実装（独立経路） |
| Lease + heartbeat | Production実装 |
| Stuck recovery | Production実装 + side-effect 再利用 |
| Step resume | Production実装 |
| run_automation sync | 部分実装（Worker内で V1 `runNow` — API寿命から独立だが重い） |

## 4. Single Source of Truth

```
Automation (definitions: durable domain)
 → Schedule.nextRun
 → OccurrenceKey
 → Work Job (Postgres)
 → Steps
 → Side Effects (idempotency)
 → Completion Evidence (step outputs)
```

ブラウザ / localStorage は SoT にしない。

## 5. DB schema / migration

- `supabase/migrations/20260802_atlas_work_queue.sql`
- `supabase/migrations/20260803_atlas_work_queue_reliability.sql`
  - `retry_history`
  - `atlas_work_queue_meta`
  - `atlas_work_queue_side_effects`（UNIQUE idempotency_key）

## 6–16. 構成要約

- **Job model / 状態遷移**: `lib/work-queue/types.ts`（terminal → completed 禁止）
- **Scheduler**: enqueue only + `nextRunAt` advance + audit logs
- **Queue**: Postgres（本番）/ file（test）
- **Worker**: lease → heartbeat → step → retry/complete → evidence gate
- **Lease**: `FOR UPDATE SKIP LOCKED` + leaseOwner/Expires + reclaim
- **Heartbeat**: 15s / stuck 90s
- **Retry**: exponential+jitter / classification / DLQ / history
- **Step resume**: 完了Step保持、失敗Stepのみ再実行、side-effect 再利用
- **Idempotency**: DB unique occurrence + step + side_effects
- **Pause/Resume/Cancel**: pause clears nextRun; resume future-only; `POST /api/worker/jobs/[jobId]/cancel`

## 17–22. 100 Occurrence 実測

| 指標 | 値 | 環境 |
|---|---|---|
| total | 100 | in-process file store |
| success | 100 | |
| failed | 0 | |
| duplicates (blocked) | 0 miss / dedupe logged | |
| missRate | 0 | |
| averageDelayMs | see artifact | |
| p95 / p99 / max | see `/opt/cursor/artifacts/scheduler-production/scheduler-100-proof.json` | |
| **Preview/本番ライブ** | **未実証** | |

## 23–28. Load / Crash / Restart

| 試験 | 結果 | 環境 |
|---|---|---|
| 100 Jobs | PASS（artifact） | in-process |
| 500 Jobs | PASS | in-process |
| 1000 Jobs | PASS | in-process |
| 5000 Jobs | PASS（安全環境） | in-process |
| Worker crash / stuck reclaim | PASS（unit） | |
| Process restart | PASS（file + Postgres unique side-effect） | |
| Recovery率 | metrics.recoverySuccessRate | |

## 29–31. Health / Metrics / Alert

`WorkQueueMetrics` + `evaluateWorkQueueAlerts` + Owner panel。  
Postgres meta 永続化（schedulerLastSuccessAt / delays）。  
Alert は接続済み owner monitoring へ（未接続 Slack を成功扱いしない）。

## 32–37. CI / TS / Lint / Build / Preview

| Gate | 結果（本ブランチローカル） |
|---|---|
| TypeScript | 0 errors |
| Lint | 0 warnings |
| Vitest work-queue | PASS（Postgres durability含む） |
| durability-ban | PASS |
| Build | （PR CIで確認） |
| Vercel Preview | PR作成後 |

CI 追加:

- Postgres service + migrations
- `work-queue-durability-ban.mjs`
- `postgres-durability.test.ts`

## 38–40. ファイル一覧

主要追加/変更:

- `lib/work-queue/store/*`（Postgres meta/side-effects/transition）
- `lib/work-queue/side-effects.ts`, `enqueue-manual.ts`, `worker.ts`, `tick.ts`
- `app/api/worker/jobs/[jobId]/cancel/route.ts`
- `app/api/automations/[id]/run/route.ts`（default enqueue 202）
- `.github/workflows/minute-scheduler.yml`（enqueue/drain 分離）
- `.github/workflows/quality-gate.yml`
- migrations / tests / CI scripts / 本レポート

## 41. 未実証

- 本番/Preview 壁時計 100 Occurrence
- Actions secrets 実働
- 本番 Supabase migration 適用確認
- multi-region Worker 実働

## 42. 未対応

- 祝日除外 / 厳密営業日
- minutely/hourly schedule preset
- V1 definition の完全 DB SoT 化
- V2 memory-store の完全廃し

## 43. 残るCritical

1. 本番 `DATABASE_URL` + migration 未適用 → 起動 fail-closed（正しい）だが運用準備必須
2. ライブ minute tick 未確認
3. `run_automation` が Worker 内で同期的に重い V1 実行を抱える

## 44. 運用コスト

低〜中: Postgres行・Actions分・既存通知。追加有料基盤なし。

## 45. ロールバック

- PR revert
- `ATLAS_WORK_QUEUE_DRAIN_ON_TICK` / `ATLAS_RUN_SYNC=1` で過渡的同期へ戻せる（非推奨）
- migration は additive（drop不要）

## 46. Phase判定: **CONDITIONAL FAIL**

## 47. 予定実行を信用できる: **NO**（ライブ実測まで）

## 48. Crash後も仕事が失われない: **YES（Postgres本番時） / NO（未適用時）**

## 49. 根拠

- Job/Step/SideEffect は Postgres unique + SKIP LOCKED lease
- 本番 file SoT 禁止
- 完了は evidence gate、terminal→completed 禁止
- ただし Preview/本番壁時計の 100 Occurrence が未実証のため Production PASS にしない
