# Durable SoT Migration Plan (from 1-1 Audit)

本ドキュメントは Phase 1-1 監査結果に基づく **計画** です。スキーマ適用・Queue 全面置換は含みません。

## 現状サマリ

| 領域 | 現在の SoT | 再起動耐性 |
|---|---|---|
| Work Queue Job/Step/Lease | Postgres **intended** / file fallback / CI FORCE_FILE | PG のみ耐性あり |
| Automation V2 Run / Occurrence / Idempotency | process `Map` + fire-and-forget durable-domain | 弱い |
| Legacy automation jobs | Supabase table / memory Map fallback | 条件付き |
| Memory / Notifications / Automations V1 | process hot + `atlas_user_state` (void persist) | 書き込み完了前は消失 |
| Artifacts | memory + durable-store/Storage (void persist) | crash window あり |
| Browser prefs / First Experience | localStorage / sessionStorage | サーバー SoT ではない |
| savedMinutes | derived (`null` 可) | 永続ストアなし |

## P0（先に潰す）

1. Work Queue file fallback を本番で禁止（fail-fast 診断を 1-1 で追加済み）
2. V2 Run/Occurrence/Idempotency を DB unique + repository へ
3. External Action 前に durable attempt / idempotency 行
4. Completion Evidence を completed 判定の前提として DB 化
5. Heartbeat / Lease を必ず Postgres 列で調停

## 推奨移行順序

1. **Job / Run / Step** — すべての完了・再実行の軸
2. **Lease / Heartbeat** — 複数 Worker の二重実行防止
3. **Idempotency** — リトライ強化の前提
4. **Completion Evidence + External Action outbox**
5. **Scheduler / Occurrence**
6. **Retry / Recovery**
7. **Artifact / Storage metadata**
8. **Notification outbox**
9. **Memory**（await persist）
10. **Metrics / Monitoring / First Experience**

理由: 外部副作用の二重実行と仕事消失は Job/Run 軸が先。Scheduler を先に強化すると、壊れた idempotency の上で発生量が増える。

## Phase 1-2 具体対象

- 本番 Work Queue を Postgres 必須化（file fallback 到達で FATAL）
- `__atlasAutomationPlatformStore` の runs / occurrenceKeys / idempotencyKeys を DB リポジトリへ置換設計
- enqueue / terminal transition で durable write を await（または transactional outbox）
- External Action 試行レコードを provider call 前に永続化
- baseline 差分ゲートで新規 process-memory / file / detached 悪化を阻止

## Mixed SoT（明示）

詳細は `lib/persistence/durable-sot-audit/domains.ts`。代表例:

- **Job**: Postgres ↔ file ↔ legacy memory
- **Run**: memory Map ↔ `atlasAutomationRunsV2` void persist ↔ migration table（runtime 未確認）
- **Memory**: process Map ↔ `atlas_user_state`（localStorage は非 SoT）
- **Notification**: process array ↔ durable domain ↔ DLQ table；delivery は detached
- **Artifact**: memory ↔ DB metadata ↔ Storage；local backend は非本番 SoT

## 未確認

- リモート Supabase への migration 適用状態
- 本番 `DATABASE_URL` 常時存在
- `atlas_automations` / `atlas_automation_runs` の runtime repository 使用有無
- `.data/attachments` 実ファイル書き込み（docs あり / 実装は memory）

## Rollback

1-1 自体は監査・診断のみ。Work Queue fail-fast は本番で危険 fallback を拒否する方向の安全側変更。問題時は `ATLAS_WORK_QUEUE_FORCE_FILE` をテスト専用に限定したまま、Postgres 接続を復旧する。
