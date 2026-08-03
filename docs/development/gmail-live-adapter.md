# Gmail Production Live Adapter（Phase 3-3）

## 経路

Automation → Run → Step `gmail` → `strictStepInvoker` → `invokeGmailLiveStep` → `googleGmailLiveAdapter` → Gmail API（draft/send/reply）→ 再取得検証 → External Action / Completion Evidence → Notification

## 成功条件

- Gmail API 到達
- draftId / messageId / threadId 取得
- Provider 再取得で Subject / To / 添付数一致
- 承認前送信 0
- 同一 Idempotency で draft/send 二重実行 0

## 環境変数

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`
- `ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY`（または `ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY`）
- Live E2E（任意）: `GOOGLE_GMAIL_LIVE_E2E=true` + テストアカウント用 refresh token

## Scope

| 用途 | 必要 Scope |
|------|------------|
| 下書き | `gmail.compose`（`gmail.modify` でも可） |
| 送信 | `gmail.send`（`gmail.modify` でも可） |
| 返信 | `gmail.send` + `gmail.readonly`（または `gmail.modify`） |
| 再取得 | `gmail.readonly` / `gmail.modify` |

## 配送保証の表示

送信成功は **Provider 受付済み**（messageId 再取得成功）まで。相手側配送完了は保証しない。
