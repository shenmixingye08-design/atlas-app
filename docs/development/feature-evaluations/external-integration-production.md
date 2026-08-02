# 【ATLAS機能評価】External Integration Production

機能名：外部連携本番化（仕事完了まで Fail Closed）

ユーザー価値：成果物ができただけでは終わらず、保存・投稿・送信・通知まで完了して初めて「完了」。途中成功の誤報告をなくす。

差別化：API接続の有無ではなく、リモートID/URL/Checksum検証と Fail Closed で仕事完了を保証する。

繰り返し作業の削減：はい — 「手動でDrive/Dropboxへ保存」「WP/Xへ再投稿」「失敗に気づかず再実行」を削減

AI必要度：不要 — 接続・Retry・検証・完了判定は通常プログラム

AIなしで実装可能：はい

運営コスト：外部API呼び出しは既存連携時のみ。検証は軽量GET/メタデータ確認。100回ベンチはSandbox/評価モード。

外部APIコスト：有（Google/Dropbox/X/WP 等の既存従量）— 新規SaaSなし。検証GETは最小回数。

コスト削減案：

- [x] エコモード — 未接続サービスは起動しない
- [x] まとめて生成 — 同一成果物を複数先へバッチupload
- [x] キャッシュ — connection health / token を短時間再利用
- [x] 予約実行 — Automation経由の予約投稿を既存schedulerで
- [x] AI起動条件 — 外部連携にAI不要
- [x] 外部API最小化 — 成功時のみ検証GET、4xxは即停止
- [x] 承認後実行 — 高影響投稿は既存approvalと整合
- [x] 再生成禁止 — idempotency keyで二重投稿防止

優先度：P0
