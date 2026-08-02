# Live Adapter Production（新機能ではなく本番保証）

## 【ATLAS機能評価】

機能名：Production Live Adapter 保証（sandbox/stub 根絶）

ユーザー価値：外部連携を含む仕事が本物の API で最後まで完了し、偽成功がなくなる

差別化：途中成功・sandbox 既定を禁止し、externalActionId/URL 付きで完了を証明

繰り返し作業の削減：はい — 手動再投稿・再アップロード・接続確認のやり直しを削減

AI必要度：不要 — 接続・実行・証跡は通常プログラム

AIなしで実装可能：はい

運営コスト：AI なし。Provider API 従量のみ（ユーザー承認後）

外部APIコスト：有 — Google / X / Dropbox / WordPress（利用時のみ）

コスト削減案：

- [x] エコモード — 外部投稿は承認後
- [x] まとめて生成 — 成果物生成と外部送信を分離
- [x] キャッシュ — idempotency で再送禁止
- [x] 予約実行 — Scheduler + Approval
- [x] AI起動条件 — AI不使用
- [x] 外部API最小化 — Preflight 通過後のみ
- [x] 承認後実行 — 高リスクは必須
- [x] 再生成禁止 — runId+stepId / content hash

優先度：P0
