# 【ATLAS機能評価】Google Calendar Live Adapter Production（Phase 3-4）

機能名：Google Calendar Production Live Adapter（Automation 予定作成・更新・取消）

ユーザー価値：正しい日時・参加者・タイムゾーン・承認条件で予定を一度だけ登録し、eventId/URL を再取得検証して完了証拠に残す。手作業のカレンダー転記を減らす。

差別化：OAuth 接続だけで終わらず、Provider 再取得・承認ゲート・二重予定防止・Evidence 永続まで含む本番経路。

繰り返し作業の削減：はい — 予定作成・招待・更新・取消の習慣作業を削減

AI必要度：不要 — Calendar API・日時検証・RRULE・Idempotency は通常プログラム

AIなしで実装可能：はい

運営コスト：Calendar API 呼び出しのみ。AI トークン追加なし。外部参加者招待時のみ人的承認。

外部APIコスト：有 — Google Calendar API（OAuth ユーザー割り当て）。テストは管理カレンダーのみ。

コスト削減案：

- [x] エコモード — 本 Adapter は AI 不使用
- [x] まとめて生成 — 既存 Automation ステップと組み合わせ
- [x] キャッシュ再利用 — Idempotency で eventId 復元、再作成しない
- [x] 予約実行 — 既存 Automation スケジュールに載せる
- [x] AI起動条件 — AI を起動しない
- [x] 外部API最小化 — 接続/Scope 検証後のみ、再取得は検証に限定
- [x] 承認後実行 — 外部参加者招待は承認後のみ
- [x] 再生成禁止 — 永続 Idempotency

優先度：P0 — Phase 3-4 本番外部連携
