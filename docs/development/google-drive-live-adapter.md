# Phase 3-2 Google Drive Live Adapter (Production)

## 目標

Automation が生成した実成果物を Google Drive 指定フォルダへ **1回だけ** 保存し、`fileId` / `webViewLink` / size / checksum / 再取得検証を完了証拠として永続化する。

## 新経路

Automation → Run → Job → Step(`google_drive`) → `strictStepInvoker` → `invokeGoogleDriveUploadStep` → `googleDriveLiveAdapter` → Drive API upload + re-fetch → External Action / Completion Evidence → Notification(URL)

## 旧経路（維持）

- UI/API: `lib/integrations/google/drive/service.ts`
- Legacy deliverable bridge: `lib/integrations/google-drive/provider.ts` + `upload-service.ts`

## Production 登録

- Capability: `google_drive`
- Production Step Registry: `requiredAdapter: "google_drive"`
- `isLiveAdapterWired("google_drive") === true`
- sandbox / mock fallback なし

## Token

- AES-256-GCM（`ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY`）
- Scope 既定: `drive.file`（legacy `drive` も受理）
- PKCE S256 on authorize

## Live E2E

実 API は `GOOGLE_DRIVE_LIVE_E2E=true` + 専用テストアカウントでのみ。CI では契約テストのみ。
