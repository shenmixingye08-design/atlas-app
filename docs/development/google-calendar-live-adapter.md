# Google Calendar Production Live Adapter（Phase 3-4）

## 経路

Automation → Run → Step `google_calendar` → `strictStepInvoker` → `invokeGoogleCalendarLiveStep` → `googleCalendarLiveAdapter` → Calendar API → 再取得検証 → External Action / Evidence → Notification

## 成功条件

- Calendar API 到達
- eventId / htmlLink 取得
- Provider 再取得で title / start / end / attendees 一致
- 承認前の外部招待 0
- 同一 Idempotency で二重作成 0

## Conflict Policy（既定: `warn`）

- `allow` — 重複を無視して作成
- `warn` — 重複を記録しつつ作成（既定）
- `fail` — 重複時は作成禁止

## 環境変数

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`
- `ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY`
- Live E2E（任意）: `GOOGLE_CALENDAR_LIVE_E2E=true`
