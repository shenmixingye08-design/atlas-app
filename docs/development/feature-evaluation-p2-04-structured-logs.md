# 【ATLAS機能評価】P2-04 相関ID付き構造化ログの永続化

機能名：相関ID付き構造化ログの永続化（P2-04）

ユーザー価値：夜間障害・再起動・複数インスタンス横断でも、同じ correlationId で原因を追える（再現不能な「処理できませんでした」をなくす）

差別化：process memory（max 2000）ではなく Postgres SoT。相関ID・Vercel request id・JobID を揃えて調査可能

繰り返し作業の削減：はい — ログ消失による手作業の再調査・推測デバッグを減らす

AI必要度：不要 — 永続化・相関・秘匿 redact は通常プログラム

AIなしで実装可能：はい — DB append + probe + CI ban

運営コスト：低（INSERT/SELECT のみ、probe は短時間）

外部APIコスト：無

コスト削減案：

- [x] エコモードで足りるか — AI不使用
- [x] まとめて生成できるか — N/A（ログ append）
- [x] キャッシュ再利用できるか — memory はキャッシュのみ、SoT ではない
- [x] 予約実行にできるか — Actions verify / health probe
- [x] AI起動条件を絞れるか — AIなし
- [x] 外部APIの呼び出しタイミングを最小化できるか — 自ホスト DB のみ
- [x] 完全自動ではなく承認後実行にできるか — DDL は idempotent apply、ユーザー操作不要
- [x] 同じ処理を再生成しない設計にできるか — id 主キーで冪等 upsert

優先度：P2（47/100 評価の公開後項目 #18）

## 正式出典（推測禁止）

47/100 / `docs/development/feature-evaluation-p2-01-api-contracts.md` P2 一覧:

- P2（公開後）項目 18 = **相関ID付き構造化ログの永続化**（本 P2-04）
- TOP20 痛み: `developer-log` が process memory・max 2000 依存で、夜間障害がインスタンス/再起動を跨いで調査不能

P2 全5項目（15–19 → P2-01–P2-05）の 4 番目。**P2-05（OCR）には着手しない。**

## Acceptance Criteria

1. 構造化エラーログに correlationId（および vercelRequestId / diagnosticId / jobId 等）が付く
2. Postgres `atlas_structured_logs` が SoT（memory はキャッシュのみ）
3. 再起動・multi-instance 後も correlationId で DB から読める
4. secrets / tokens は redact（永続化前）
5. CI ban + 専用テスト + Production `/api/health/structured-logs` で実証（soft-success 禁止）
6. P0 / P1 / P2-01 / P2-02 / P2-03 を壊さない
