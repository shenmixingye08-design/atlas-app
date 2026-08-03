# 【ATLAS機能評価】Phase 3-2 Google Drive Live Adapter

機能名：Google Drive Production Live Adapter（Automation成果物の実アップロード）

ユーザー価値：生成した実成果物を手動アップロードせず Drive 指定フォルダへ一度だけ保存し、URLで確認できる

差別化：fileId・webViewLink・size・checksum・再取得検証付き完了証拠。接続画面だけでは成功にしない

繰り返し作業の削減：はい — Driveへの手動保存・フォルダ探し・共有リンク確認が減る

AI必要度：不要 — 通常プログラム + Google Drive API

AIなしで実装可能：はい

運営コスト：Drive API 呼び出しのみ（生成AI追加なし）。upload/verify で1成果物あたり2〜3 API call

外部APIコスト：有 — Google Drive API（無料枠内で検証可能）。月次はユーザー接続数に比例

コスト削減案：

- [x] エコモードで足りるか（DriveはAI不要）
- [x] まとめて生成できるか（複数成果物は順次・idempotent）
- [x] キャッシュ再利用できるか（idempotencyで再upload禁止）
- [x] 予約実行にできるか（Automationスケジュール経由）
- [x] AI起動条件を絞れるか（AI不使用）
- [x] 外部APIの呼び出しタイミングを最小化できるか（verify必須最小限）
- [x] 完全自動ではなく承認後実行にできるか（高リスク時は既存承認ゲート）
- [x] 同じ処理を再生成しない設計にできるか（durable idempotency）

優先度：P0（Phase 3-2 本実装対象第1位）
