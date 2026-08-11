# 【ATLAS機能評価】

機能名：P3-01 CORE LOOP — `atlas_document_generation_jobs` Production schema apply

ユーザー価値：Word 成果物が完成しても DB テーブル欠落で Job が failed にならず、ダウンロードまで完了する。

差別化：会話ではなく仕事完了。運営 DDL 適用漏れがお客様の CORE LOOP を止めないよう、Production から idempotent apply できる。

繰り返し作業の削減：はい — 失敗 Job の再実行・問い合わせを削減

AI必要度：不要 — DDL + health probe

AIなしで実装可能：はい

運営コスト：AI なし。1 回の schema apply + 以後 idempotent

外部APIコスト：無（Supabase DDL）

コスト削減案：

- [x] エコモードで足りるか — 該当なし
- [x] まとめて生成できるか — 該当なし
- [x] キャッシュ再利用できるか — schema は一度適用すれば再利用
- [x] 予約実行にできるか — CI apply で実行
- [x] AI起動条件を絞れるか — AI 不使用
- [x] 外部APIの呼び出しタイミングを最小化できるか — apply は欠落時のみ
- [x] 完全自動ではなく承認後実行にできるか — CRON/owner ゲート付き apply=1
- [x] 同じ処理を再生成しない設計にできるか — `create table if not exists`

優先度：P0（Production CORE LOOP ブロッカー）
