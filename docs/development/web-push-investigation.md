# Web Push 調査レポート（STEP 0）

## 調査日

2026-07-22

## 1. In-app only vs Browser Notification vs Push API

| 方式 | 現状 | ブラウザ閉鎖時 |
|------|------|----------------|
| In-app（`atlas_user_state` + ベル UI） | 実装済 | 不可 |
| `Notification` API（タブ表示中のみ） | 未使用 | 不可 |
| **Web Push + Service Worker** | **本 PR で実装** | **OS 通知として可** |

## 2. Service Worker / PWA manifest

- **以前**: なし（`OfflineWatcher` は online 検知のみ）
- **本 PR**: `public/sw.js`, `public/manifest.webmanifest`, アイコン, `PushProvider` による単一登録

## 3. Completion emitters → 通知

- `lib/notifications/emitters.ts` が automation / work / integration 完了・失敗を `createNotification()` へ
- **以前**: LINE のみ外部配送。push チャネルは型のみ
- **本 PR**: `createNotification()` 後に `dispatchWebPushNotification()` を非同期実行

## 4. Supabase 永続化

- 通知本体: `atlas_user_state` domain `atlasNotifications`（JSON）
- **本 PR**: `atlas_push_subscriptions` テーブル（endpoint, keys, device, failure_count）

## 5. Per-device subscription storage

- **以前**: なし
- **本 PR**: Supabase `atlas_push_subscriptions`、Clerk `userId` あたり複数 endpoint

## 6. Background when browser closed

- Web Push + SW により **HTTPS 本番**で OS 通知可能
- Vercel serverless から `web-push` で送信（FCM 不要）

## 7. Vercel suitability

- 日次 cron（`vercel.json` `0 0 * * *`）→ `/api/automations/tick` を維持
- Push 送信は stateless POST、VAPID 鍵は env のみ
- Hobby の hourly cron は追加せず（既存 daily のみ）

## 8. Job/cron/queue/workflow layout

- Automations: `automationService.processDueAutomations()` via daily tick
- X scheduled posts / auto posts: same tick
- **本 PR**: daily report aggregation を tick に追加
- Job retry state: in-memory `lib/jobs/reliability.ts`（Supabase 永続化は未対応）

## 9. Existing retry

- `lib/integrations/retry.ts` — generic 3 attempts
- `lib/orchestration/execution-reliability.ts` — run logs + notification guarantee
- **本 PR**: `lib/jobs/retry-classifier.ts` — 1m/5m/15m、OAuth/permission は non-retryable

## 10. Why read-state may not sync

- Serverless cold start で in-memory が空 → `ensureNotificationsHydrated` 必須
- 以前: `schedulePersistNotifications` が fire-and-forget で read が失われるケース
- 修正済み: `PATCH /api/notifications/[id]/read` は `persistNotificationsNow` を await
- **本 PR**: push click → `/api/push/click` → mark read + persist

## FCM vs Web Push + VAPID（選択）

**選択: Web Push + VAPID**

| 観点 | FCM | Web Push + VAPID |
|------|-----|------------------|
| 既存スタック | Firebase 未導入 | Next.js + Vercel + Clerk のみ |
| ネイティブアプリ | 有利 | 未計画 |
| コスト | 無料 tier あり、GCP 依存 | **完全無料**（`web-push` npm） |
| 実装 | Firebase プロジェクト + SDK + SW | VAPID 3 env + SW + Supabase |

FCM for Web も結局 Push API + SW が必要なため、追加複雑度に見合わない。

## 【ATLAS機能評価】

```
機能名：スマホ Web Push 信頼性レイヤー
ユーザー価値：アプリを毎日開かなくても完了・失敗・確認依頼が届く
差別化：AI秘書が「設定したら走って、結果を通知」まで一気通貫
繰り返し作業の削減：はい（アプリ起動・確認の習慣削減）
AI必要度：低（テンプレート文案・集計のみ）
AIなしで実装可能：はい
運営コスト：VAPID 鍵管理 + Supabase 行増（微量）
外部APIコスト：0（Web Push 無料）
コスト削減案：エコモード維持 / push は rule-based / 中間ステップ OFF / quiet hours / 失敗 subscription 自動 prune / 日次まとめ 1 回
優先度：高
```

## Manual SQL apply

`supabase/migrations/20260722_atlas_push_subscriptions.sql` を Supabase SQL Editor で実行。
