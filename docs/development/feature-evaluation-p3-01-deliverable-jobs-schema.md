# 【ATLAS機能評価】

機能名：P3-01 CORE LOOP — `atlas_deliverable_jobs` Production schema apply

ユーザー価値：Word パイプラインの durable job SoT が欠落して Job failed にならない。

差別化：仕事完了優先。運営 DDL 漏れで成果物完了後に失敗しない。

繰り返し作業の削減：はい

AI必要度：不要

AIなしで実装可能：はい

運営コスト：AI なし。1 回の schema apply

外部APIコスト：無

コスト削減案：

- [x] エコモードで足りるか — 該当なし
- [x] まとめて生成できるか — 該当なし
- [x] キャッシュ再利用できるか — schema 一度適用で再利用
- [x] 予約実行にできるか — CI apply
- [x] AI起動条件を絞れるか — AI 不使用
- [x] 外部APIの呼び出しタイミングを最小化できるか — 欠落時のみ
- [x] 完全自動ではなく承認後実行にできるか — CRON/owner apply=1
- [x] 同じ処理を再生成しない設計にできるか — create table if not exists

優先度：P0
