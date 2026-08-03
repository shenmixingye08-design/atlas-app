# Scheduler Production Cutover — Phase 2-5

## 【ATLAS機能評価】

```
機能名：Scheduler Production Cutover（2-5）
ユーザー価値：障害検知・復旧手順が揃い、手動監視が減る
差別化：Health/Metrics/Alert/Dashboard/Runbook/Chaos を正式経路に接続
繰り返し作業の削減：はい
AI必要度：不要
優先度：P0
```

## 提供物

| 面 | 実装 |
|----|------|
| Health | `buildSchedulerOpsSnapshot().health` + Owner panel |
| Metrics | tick/run/occurrence/queue/miss/dup/retry/recovery + p50/p90/p95/p99 |
| Alert | stopped/due/queue/dup/miss/worker/retry/recovery/p95 + kill switches |
| Dashboard | `/owner/scheduler` sections: Health/Metrics/Scheduler/Queue/Worker/Automation |
| Runbook | `docs/operations/scheduler-runbook.md` |
| Chaos | `lib/scheduler-core/ops/chaos.test.ts` → artifacts |

## 24時間運用可能か（正直）

**NO（実測根拠なし）を Production 主張としては禁止。**

本フェーズで実測したのは:

- Ops snapshot / Alert 発火（chaos）
- Dashboard API フィールド
- Runbook 文書
- CI 品質ゲート

未実測:

- Production 上の連続 24h cron
- Production Supabase History
- Preview 認証付き live tick（Deployment Protection）
- Network 切断 / Deploy 中断のライブ注入

Cutover **準備完了**と **Production 24h 実証済み**は別物。

## 実行

```bash
npm test -- --run lib/scheduler-core/ops
npm run ci:scheduler-core-gate
```

Chaos 証拠: `/opt/cursor/artifacts/scheduler-cutover-2-5/`
