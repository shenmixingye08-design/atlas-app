# 【ATLAS機能評価】Automation Phase 5 Durable Recovery / Retry / Resume

機能名：Automation Phase 5 — Durable Recovery / Retry / Resume

ユーザー価値：途中失敗・再起動・重複実行でも仕事が二重作成されず、最後まで完走／安全に失敗でき、監視・手動復旧の手間を減らす

差別化：process memory に依存せず DB SoT から mid-step resume / bounded retry / occurrence idempotency まで Production 完走

繰り返し作業の削減：はい — 失敗確認・再実行・二重作成の掃除を削減

AI必要度：不要

AIなしで実装可能：はい

運営コスト：追加 AI なし。orphan reclaim は Minute tick 内で限定件数

外部APIコスト：無（追加呼び出しなし。既存 side-effect claim で二重実行防止）

コスト削減案：

- [x] エコモード — N/A（AI なし）
- [x] まとめて生成 — N/A
- [x] キャッシュ再利用 — side-effect claim / succeeded step skip
- [x] 予約実行 — nextRetryAt による bounded retry
- [x] AI起動条件 — AI なし
- [x] 外部API最小化 — 成功済み external 再実行禁止
- [x] 承認後実行 — awaiting_approval SoT 復元を維持
- [x] 再生成禁止 — occurrenceKey + claim（runId 非依存）

優先度：P0
