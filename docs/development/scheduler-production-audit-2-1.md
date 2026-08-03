# Scheduler Production Audit — Phase 2-1

Branch: `cursor/scheduler-production-audit-2706`  
Scope: **audit only**（Scheduler/Worker/Queue 全面改修なし）

## 【ATLAS機能評価】

```
機能名：Scheduler Production Audit（2-1）
ユーザー価値：実行漏れ・二重実行・認証不足を可視化し、習慣的な再確認・手動再実行を減らす前提を作る
差別化：推測ではなく main の実コード + デプロイ設定から起動経路・SoT・リスクを確定
繰り返し作業の削減：一部（監査自体は運用改善の土台。お客様向け機能追加ではない）
AI必要度：不要
AIなしで実装可能：はい（静的監査・テスト・artifact）
運営コスト：低（CI artifact / 差分ゲートのみ）
外部APIコスト：無
コスト削減案：エコモードN/A / まとめて生成N/A / キャッシュ=inventory再利用 /
  予約実行N/A / AI起動なし / 外部APIなし / 承認後=Phase 2-2実装 /
  再生成禁止=差分ゲートでvercel.json drift検知
優先度：P0（本番信頼の前提）
```

---

## 1. Scheduler起動経路一覧

| id | file | route | auth | frequency | Job | Run | Prod | Preview |
|---|---|---|---|---|---|---|---|---|
| vercel-cron-hobby-daily | `vercel.json` | `/api/automations/tick` | CRON_SECRET (platform) | `0 0 * * *` | Yes | Yes | UNCONFIRMED fire | No (platform) |
| vercel-cron-pro-template | `vercel.cron.pro.json` | same | same when wired | `* * * * *` | — | — | inactive | inactive |
| github-actions-minute | `.github/workflows/minute-scheduler.yml` | POST tick | Bearer CRON_SECRET | `* * * * *` | Yes | Yes | UNCONFIRMED secrets | No |
| api-automations-tick | `app/api/automations/tick/route.ts` | tick | secret/owner/(nonprod user) | on invoke | Yes | Yes | Yes | Yes |
| api-worker-drain | `app/api/worker/drain/route.ts` | drain | handler auth | on invoke | drain only | No | **No via secret-only** | **No via secret-only** |
| owner-manual-tick-ui | owner panel | tick | Owner session | manual | Yes | Yes | Yes | Yes |
| client-tickAutomations | `lib/automations/client.ts` | tick | session | manual | Yes | Yes | Yes | Yes |
| processWorkQueueTick | `lib/work-queue/tick.ts` | — | N/A | on call | Yes | No | Yes | Yes |
| processDueScheduledAutomationsV2 | `lib/automation-platform/schedule/due-tick.ts` | — | N/A | on tick | No | Yes | Yes* | Yes* |
| v2-to-v1-bridge | bridge | — | N/A | on sync | No | No | Yes | Yes |

\*V2 due scan is memory-only unless `hydrateUserIds` provided (tick route does not).

No `setInterval` automation tick found. `INTERNAL_API_SECRET` does not exist.

---

## 2. Cron一覧 / 3. Vercel設定監査

| Source | Active | Schedule | Path | Method | Secret | Retry | Evidence |
|---|---|---|---|---|---|---|---|
| `vercel.json` | **Yes** | daily `0 0 * * *` | `/api/automations/tick` | GET/POST | CRON_SECRET | UNCONFIRMED | NONE in repo |
| `vercel.cron.pro.json` | No (template) | minute | same | GET/POST | same | — | — |
| GH Actions minute | Yes (workflow file) | minute | POST `$ATLAS_APP_URL/.../tick` | POST | GH secrets | fail on curl -f | UNCONFIRMED |

**Repoに無いもの（未確認）:** Function timeout / Region / concurrency / Hobby vs Pro plan 実アカウント状態。  
`next.config.ts` に cron 設定なし。  
Preview: Vercel Cron はデフォルトで Production のみ（platform）。Preview は手動/Owner tick 依存。

---

## 4–5. Secret一覧 / 未設定時

| Secret | Required | Missing | Notes |
|---|---|---|---|
| `CRON_SECRET` | Yes (runtime) | Prod **503** fail-closed + `diagnosticCode=cron_secret_missing` | timing-safe compare |
| `ATLAS_APP_URL` | Yes for GH Actions | workflow exit 1 | not in Next runtime |
| `NEXT_PUBLIC_APP_URL` | app URLs | fallback chain | not tick auth |
| `ENABLE_SCHEDULED_CRON` | optional | default on; `false` → 200 skipped | kill-switch |
| `INTERNAL_API_SECRET` | N/A | does not exist | — |
| DB URLs | for PG queue | file-store fallback | migration apply UNCONFIRMED |

**Production設定済みか:** リポジトリからは **UNCONFIRMED**（Owner env-status / Vercel dashboard 要確認）。

未設定時に成功レスポンスを返す経路: **認証欠落では返さない**。ただし `ENABLE_SCHEDULED_CRON=false` は認証成功後に `{skipped:true}` を 200 で返す（意図的）。

---

## 6–7. nextRunAt計算経路 / 重複実装

| Case | Function | File |
|---|---|---|
| V1 create/update/enable | `computeNextRunIso` | `domain.ts` / `server-automation-repository.ts` |
| V1 pause/resume | enable=false → null; enable → recompute | automation service |
| V1 skip next | `computeSkipNextRunIso` | `schedule-math.ts` |
| V1 run complete | `computeNextRunIso(..., completedAt)` | `run-automation.ts` |
| V1 due tick | `advanceNextRun` always after enqueue/dedupe | `tick.ts` + `scheduler.ts` |
| V1 core math | `computeNextFromPreset` | `schedule.ts` (Intl TZ / DST offset) |
| V2 create/update/due | `computeNextRunIsoFromTrigger` | `automation-platform/schedule/compute.ts` |

**重複実装:** V1 `lib/automations/schedule.ts` と V2 `lib/automation-platform/schedule/compute.ts`（別世代）。cron 文字列は保存されるが **next fire の SoT ではない**。

---

## 8. Due Tick経路

`POST/GET /api/automations/tick`:

1. `authorizeAutomationTick`（fail-closed）
2. `ENABLE_SCHEDULED_CRON` gate
3. `processWorkQueueTick`:
   - owner index hydrate
   - due = enabled && !paused && nextRun <= now（batch 50）
   - `buildOccurrenceKey` → store.enqueue（unique）
   - **always** advance nextRun
   - `drainWorkQueue`
   - legacy job reliability tick
   - alerts
4. V2 `processDueScheduledAutomationsV2({dispatch:false})` + `dispatchAutomationRuns`（errors swallowed）
5. X scheduled / autopost
6. daily reports
7. monitoring + in-memory cron debug

**Transaction:** enqueue と nextRun 更新は非トランザクション。  
**Idempotency:** occurrenceKey / idempotency_key unique（PG migration）。  
**claimAutomationTickSlot:** 実装・テストあり、**本番 tick 未配線**。

---

## 9. Scheduler SoT表

| State | SoT |
|---|---|
| V1 Schedule / nextRun | mixed (Supabase user state + memory) |
| V2 nextRunAt | mixed (Supabase V2 + memory; cron discovery incomplete) |
| occurrence V1 | mixed (PG unique or file JSON) |
| occurrence V2 | mixed (partial unique index + memory) |
| schedulerLastSuccessAt (PG store) | **process memory**（SQL未保存） |
| cron monitor | mixed (globalThis + monitoring persist) |
| Scheduler History | **undefined** |
| metrics avg/p95 | mixed / per-instance |

---

## 10–11. 認証監査 / 未認証経路

- timing-safe: **Yes**
- Production secret missing: **503** + diagnostic log/code
- Wrong secret: **401**（Owner は可）
- Tick は Clerk public matcher、ただし route auth 必須
- **未認証で Scheduler を動かせる本番経路: なし（P0未検出）**
- `/api/worker/drain` は public でなく、CRON_SECRET 単独到達不可（P1）
- Preview/non-prod: サインインユーザーなら tick 可

---

## 12–14. Duplicate / Miss / Crash

| Case | Duplicate | Miss | Recovery |
|---|---|---|---|
| Cron double fire | occurrence dedupe | — | yes |
| Vercel retry | same | — | yes if unique holds |
| Manual Run Now vs Cron | dedupe | — | yes |
| 2 instance tick | PG unique yes; file race risk | — | PG preferred |
| crash after job before nextRun | retry dedupes job; nextRun still due | possible re-attempt | occurrence blocks double job |
| crash after nextRun before job | — | **yes** | needs repair |
| always-advance on V2 failure | — | **yes (slot skip)** | manual |
| Hobby daily only | — | **sub-daily miss** | GH minute or Pro |
| V2 no hydrate | — | **cold miss** | hydrate |

---

## 15–16. Timezone / DST

検証テスト追加済み（Asia/Tokyo, UTC, America/New_York spring, Europe/London autumn, Feb leap, weekday, V2 weekdays/once）。  
Ambiguity: Intl offset recompute；完全な全遷移行列は未整備（既存 smoke + 本監査拡張）。

---

## 17. Scheduler Health現状

| Signal | Status |
|---|---|
| last tick / success / failure | partial (monitoring + in-memory) |
| due / queue / stuck | partial / implemented |
| schedule delay avg/p95 | partial (instance-local on PG) |
| missed / duplicate history | unimplemented / partial |
| alert | implemented (work-queue alerts + monitoring) |

---

## 18–19. 本番実測証拠 / 100回実測の真偽

- Live Vercel cron 100回: **なし**
- `scheduler-100-proof.json`: **in-process Vitest**（`production-proof.ts` が明示）
- 「100回実測済み＝本番Scheduler」は **偽**

---

## 20–22. P0 / P1 / P2

**P0:** 分単位未証明/daily暗黙依存; V2 hydration miss; enqueue後 advance 非TX; V2 failure advance  
**P1:** drain 非公開; Historyなし; PG heartbeat memory; secrets UNCONFIRMED; Preview差; claim未使用; 100回が in-process  
**P2:** メトリクス時系列不足; V1/V2 nextRun二重実装

詳細: `artifacts/scheduler-audit-2-1/scheduler-risk-register.json`

---

## 23. Phase 2-2対象（実装しない）

優先順: Secret/Cron一本化 → due tick TX → V2 hydrate → occurrence/claim整理 → History → Health heartbeat → Preview分離 → 分単位本番証明 → fail-closed維持

計画: `scheduler-phase-2-2-plan.md`

---

## 24–25. 追加テスト / CI artifact

- `lib/scheduler-audit/scheduler-audit.test.ts`
- `lib/automations/tick-auth.test.ts`（diagnosticCode）
- Artifacts: `scheduler-audit.json`, `cron-inventory.json`, `scheduler-secrets-audit.json`, `next-run-at-paths.json`, `scheduler-risk-register.json`, `scheduler-phase-2-2-plan.md`
- CI: quality-gate に audit step + upload（既存P0で無条件FAILしない。vercel.json driftのみFAIL）

---

## 判定（コード監査時点）

| # | Item | Result |
|---|---|---|
| 36 | Phase判定 | **PASS**（監査完了・全面改修なし） |
| 37 | Schedulerを100%把握できた | **YES**（in-repo経路）。外部ダッシュボード値は UNCONFIRMED |
| 38 | 分単位本番実行が現在証明されている | **NO** |
| 39 | 根拠 | active `vercel.json` は daily; minute は GH Actions で secrets/live fire 未確認; 100回は in-process |
