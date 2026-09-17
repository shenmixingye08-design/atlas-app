# Phase 1-2 Durable SoT Implementation（土台のみ）

## 【ATLAS機能評価】

機能名：Durable SoT DB 土台（Schema / Migration / Repository / Interface）

ユーザー価値：再起動・複数 instance でも仕事状態が消えない前提を作る（まだ接続しない）

差別化：process memory ではなく Postgres を Single Source of Truth にする準備

繰り返し作業の削減：はい — 障害時の手作業リカバリを減らす基盤

AI必要度：不要

AIなしで実装可能：はい

運営コスト：DB ストレージのみ。AI / 外部 API なし

外部APIコスト：無

コスト削減案：

- [x] エコモードで足りるか（AI不使用）
- [x] まとめて生成できるか（一括 migration）
- [x] キャッシュ再利用できるか（Repository は SoT、cache ではない）
- [x] 予約実行にできるか（TTL/retention コメントのみ、後続 Phase）
- [x] AI起動条件を絞れるか（該当なし）
- [x] 外部APIの呼び出しタイミングを最小化できるか（該当なし）
- [x] 完全自動ではなく承認後実行にできるか（後続で Queue 接続時に適用）
- [x] 同じ処理を再生成しない設計にできるか（Idempotency / Occurrence UNIQUE）

優先度：P0

## 範囲

- **やる:** Schema / Up+Down Migration / Repository CRUD / DurableStore interface / テスト
- **やらない:** Queue/Worker/Scheduler/Automation 接続、Business Logic、UI、実行フロー変更

## テーブル prefix

既存 `atlas_work_queue_*` とは分離した `atlas_durable_*` を追加する。  
本 Phase では既存ストアへ接続しない。
