# Scheduler Wall-Clock Proof — Phase 2-4

## 性質

新機能追加ではない。**実測・障害注入・証拠作成**のみ。

## 【ATLAS機能評価】（計測ハーネス）

```
機能名：Scheduler Wall-Clock Proof（2-4）
ユーザー価値：予定実行を「テストで通った」ではなく壁時計証拠で信用できるか判定できる
差別化：正式経路 + 実待機 + duplicate/miss/Alert を保存可能な証拠に残す
繰り返し作業の削減：一部 — 手動での取りこぼし確認を減らすための検証基盤
AI必要度：不要
AIなしで実装可能：はい
運営コスト：低（検証実行時のみ）
外部APIコスト：無（Proof は ATLAS_WALL_CLOCK_PROOF_OFFLINE=true で AI なし）
コスト削減案：N/A（AIなし）/ 再実行禁止=occurrence unique / 予約実行=本検証対象
優先度：P0（信頼証明）
```

## 実行

```bash
npm run test:scheduler-wall-clock
# or
node scripts/scheduler-wall-clock-proof.mjs
```

Default CI **does not** run this (multi-minute real waits). Quality gate is unchanged.

## 環境分類（正直）

| 分類 | 意味 |
|------|------|
| `production` | 本番 Vercel + 本番 DB + 本番 Cron |
| `production_equivalent_preview` | Preview で本番相当構成 + 秘密情報で tick 可能 |
| `local_formal_path_wall_clock` | 本エージェントでの実証（正式 HTTP 経路 + 壁時計待機 + file durable） |

**本ランは `local_formal_path_wall_clock`。Production 実証ではない。**

Preview URL は Deployment Protection で 401 — live Preview tick は未実証。

## 正式経路

`POST /api/internal/scheduler/tick`  
→ `authorizeSchedulerTick` → `runSchedulerCoreTick` → Outbox Dispatcher → Durable Queue → Worker lease/running

## 証拠

`/opt/cursor/artifacts/scheduler-wall-clock-2-4/`

- `scheduler-wall-clock-proof.json`
- `scheduler-100-occurrences.csv`
- `scheduler-delay-summary.json`
- `scheduler-duplicate-report.json`
- `scheduler-missed-report.json`
- `scheduler-recovery-report.json`
- `scheduler-alert-report.json`
- `scheduler-dashboard-snapshot.json`
- `scheduler-preview-probe.json`

## DST

DST 境界の壁時計待機は本ランに含めない。決定論的統合テスト（`scheduler-core` / nextRunAt）で補完し、壁時計実測と区別する。

## 合格宣言ルール

- Production で実測していない場合: **「Productionで100回実証済み」と書かない**
- for-loop / fake timer のみ: 壁時計実証に数えない
- 未接続通知先の Alert: 配信成功扱いしない
