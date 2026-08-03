# Phase 1-4 Durable Lease / Heartbeat / Recovery

## 【ATLAS機能評価】

機能名：Durable Lease / Heartbeat / Stuck Detection / Recovery

ユーザー価値：Worker が途中で落ちても仕事が消えず、別 Worker が安全に引き継げる

差別化：leaseToken + leaseVersion による fencing で二重実行・Zombie 上書きを防ぐ

繰り返し作業の削減：はい — 落ちた仕事の手作業リカバリを減らす

AI必要度：不要

AIなしで実装可能：はい

運営コスト：Postgres のみ（追加テーブル/カラム）

外部APIコスト：無

コスト削減案：

- [x] エコモード該当なし（AI不使用）
- [x] まとめて生成：該当なし
- [x] キャッシュ再利用：Idempotency / 完了 Step スキップ
- [x] 予約実行：retry_scheduled + availableAt
- [x] AI起動条件：AIなし
- [x] 外部API最小化：Recovery 前に Side Effect 確認し無条件再実行しない
- [x] 承認後実行：Recovery 不可は manual_review
- [x] 同じ処理を再生成しない：完了 Step 再実行禁止

優先度：P0

## 範囲

- **やる:** Lease / Heartbeat / Stuck / Recovery の Durable 化、Token fencing、Crash/Concurrency テスト
- **やらない:** Scheduler / Queue 設計変更 / Automation / Completion 条件 / UI / Memory / 外部連携仕様変更
