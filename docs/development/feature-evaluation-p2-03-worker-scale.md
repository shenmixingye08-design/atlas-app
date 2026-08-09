# 【ATLAS機能評価】P2-03 worker水平スケール

機能名：worker水平スケール（P2-03）

ユーザー価値：due が溜まっても自動化が慢性遅延せず、約束した時刻に仕事が終わる

差別化：単一 curl drain ではなく SKIP LOCKED 水平 fan-out + バックプレッシャーを Production 実証

繰り返し作業の削減：はい — 遅延・再依頼・手動リトライを減らす

AI必要度：不要

AIなしで実装可能：はい

運営コスト：低〜中（並列 drain HTTP / 既存 Postgres lease）

外部APIコスト：無

コスト削減案：

- [x] エコモード — AI不使用
- [x] まとめて生成 — Scheduler は enqueue、Worker が水平分割
- [x] キャッシュ — N/A（queue 状態は DB）
- [x] 予約実行 — Minute Scheduler 本体
- [x] AI起動条件 — Worker step 到達時のみ（既存）
- [x] 外部API最小化 — tick/drain は自ホスト HTTP + DB
- [x] 承認後実行 — waiting_approval 既存維持
- [x] 再生成禁止 — 完了 step は再実行しない（既存）

優先度：P2（47/100 公開後 #17 / 問題 #20）

## 正式出典（推測禁止）

47/100 TOP20 問題 #20:

- Hobby cron 日次 + worker batch 10 + 単一 curl cron
- due が溜まると遅延が線形悪化（100人遅延 / 1000人慢性 / 10000人破綻）
- 修正: **分次cron必須、worker水平分割、claim limit見直し、バックプレッシャー**

P2 全5項目（15–19 → P2-01–P2-05）の 3 番目 = **worker水平スケール**

## Acceptance Criteria

1. 分次 tick 経路が存在する（GitHub Actions Minute Scheduler）
2. tick が単一 worker ではなく水平 fan-out drain を使う
3. claim limit が見直され（>10）、キュー深度に応じたバックプレッシャーがある
4. 複数 worker 同時 lease で二重 claim しない（SKIP LOCKED 実証）
5. Minute Scheduler が `/api/worker/drain` を並列 fan-out する
6. CI ban + 専用テスト + Production `/api/health/worker-scale` で実証
7. P0 / P1 / P2-01 / P2-02 を壊さない
