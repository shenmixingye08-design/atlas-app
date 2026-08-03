# 【ATLAS機能評価】Gmail Live Adapter Production（Phase 3-3）

機能名：Gmail Production Live Adapter（Automation 下書き / 承認後送信）

ユーザー価値：生成したメールを正しい宛先・本文・添付で Gmail に一度だけ下書き保存または送信し、draftId/messageId/threadId を再取得検証して完了証拠に残す。お客様の手作業のコピー＆ペースト・添付・送信確認を減らす。

差別化：OAuth 接続だけで終わらず、Provider 再取得検証・承認ゲート・二重送信防止・Evidence 永続まで含めた本番経路。

繰り返し作業の削減：はい — 下書き作成・宛先設定・添付・送信・確認の習慣作業を削減

AI必要度：不要 — MIME 生成・Gmail API・承認・Idempotency・再取得は通常プログラム

AIなしで実装可能：はい — Gmail API + 既存成果物 Storage + OAuth トークン管理

運営コスト：Gmail API 呼び出しのみ（下書き/送信/再取得）。AI トークン追加なし。承認待ちの人的確認は送信時のみ。

外部APIコスト：有 — Google Gmail API（OAuth ユーザー割り当て、通常は無料枠内）。テストは管理アカウント間のみ。

コスト削減案：

- [x] エコモードで足りるか — 本文生成は既存成果物を再利用、Gmail 経路は AI 不使用
- [x] まとめて生成できるか — 成果物は既存ステップで生成済みを添付
- [x] キャッシュ再利用できるか — Idempotency で draft/send 結果を復元、再送しない
- [x] 予約実行にできるか — 既存 Automation スケジュールに載せる（Scheduler 本体は変更しない）
- [x] AI起動条件を絞れるか — 本 Adapter は AI を起動しない
- [x] 外部APIの呼び出しタイミングを最小化できるか — 接続/Scope 検証後のみ、再取得は成功検証に限定
- [x] 完全自動ではなく承認後実行にできるか — send は承認後のみ（draft は承認前可）
- [x] 同じ処理を再生成しない設計にできるか — ownerId+runId+stepId+hashes で永続 Idempotency

優先度：P0 — Phase 3-3 本番外部連携の中核
