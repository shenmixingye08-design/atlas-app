# 【ATLAS機能評価】

機能名：Production CORE LOOP E2E（専用検証アカウント + Secret）

ユーザー価値：一般有料公開前に「ログイン→依頼→完了→成果物DL」が Production で完走することを機械的に証明でき、虚偽PASSを防ぐ

差別化：health probe / sample ではなく、Clerk 正規セッションで実ユーザー経路を通す監査

繰り返し作業の削減：はい — Owner が毎回手動ログインして監査する負荷を減らす（利用者向け機能ではない）

AI必要度：低 — ハーネス自体は AI 不要。検証対象の依頼実行時のみ既存 AI 経路を使う

AIなしで実装可能：はい — Playwright + Clerk Sign-in Token + 既存 API

運営コスト：手動/CI 実行時のみ。AI は検証依頼 1 件分。定期自動実行はしない（workflow_dispatch）

外部APIコスト：有 — Clerk Sign-in Token API（短命）+ 既存 OpenAI（検証依頼時のみ）

コスト削減案：

- [x] エコモードで足りるか — 検証は Word 短文 1 件のみ
- [x] まとめて生成できるか — 対象外（単一ループ証明）
- [x] キャッシュ再利用できるか — トークンは毎回短命発行（再利用しない）
- [x] 予約実行にできるか — workflow_dispatch のみ（常時実行しない）
- [x] AI起動条件を絞れるか — Secrets 未設定時は実行しない
- [x] 外部APIの呼び出しタイミングを最小化できるか — 検証実行時のみ
- [x] 完全自動ではなく承認後実行にできるか — GitHub workflow_dispatch
- [x] 同じ処理を再生成しない設計にできるか — 証拠 JSON を成果とし、成功時の再実行は任意

優先度：P0（一般有料公開ゲート）
