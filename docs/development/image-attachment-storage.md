# 画像添付ストレージ（Supabase Storage）

## バケット

- 名前: `atlas-image-attachments`
- 公開: **非公開**（`public = false`）
- 適用SQL: `supabase/migrations/20260726_atlas_image_attachments.sql`

## アップロード失敗時の診断

1. ログイン状態で `GET /api/attachments/diagnostics` を開く  
   - `serviceRoleConfigured` / `bucketExists` / `tableExists` / `blockingCode` を確認
2. Owner なら `POST /api/owner/attachments/ensure` でバケット自動作成を試行
3. `table_missing` の場合は Supabase SQL エディタで migration を適用
4. CLI（SERVICE_ROLE 設定済み環境）:
   `node scripts/apply-image-attachments-migration.mjs`

アップロード API（`/api/attachments/images`）は **Vision より前**で失敗します。  
レスポンスに `code` / `stage` / `providerCode` が含まれるので、推測せず特定できます。

## オブジェクトパス

```
{userId}/{jobId}/{attachmentId}/original.{ext}
{userId}/{jobId}/{attachmentId}/processed.{ext}
```

`jobId` 未指定時は `pending`。

## メタデータ

テーブル `atlas_image_attachments`（service role のみ）

- `expires_at` … temporary の TTL（既定24時間）
- `retention_policy` … `temporary` | `retained`
  - 成果物・プロフィール参照時は `markAttachmentRetained` で TTL除外

## OpenAI への渡し方

1. Clerk 認証ユーザーの所有確認
2. Service Role で Storage から processed 画像をダウンロード
3. Base64 data URL に変換して Responses API `input_image` へ渡す
4. モデルは `OPENAI_VISION_MODEL`（未設定時は strong カタログ既定）。Planner/Worker と混同しない

署名付きURLは短時間（60秒）ヘルパーのみ。OpenAI経路では使わない。

## Vision 失敗時の停止（成果物禁止）

画像付き依頼では、次をすべて満たすまで Artifact Engine / Commander 実行へ進まない。

- attachment `uploaded` かつ processed bytes > 0
- Vision API 成功 + Zod 検証成功
- 依頼の必須抽出項目が画像内から取得できた（または「画像内に無い」と分析成功で判定）

失敗時は `vision_failed` / `needs_image_retry` / `needs_input` / `config_missing` で停止し、
「画像確認要」などの仮成果物は生成しない。

Preview/Production で `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` が無い場合は
`config_missing` として停止（一般論の成果物へフォールバックしない）。

## バックエンド切替

| 環境 | 保存先 |
|------|--------|
| `VERCEL_ENV=production` / `preview` | **必ず Supabase** |
| ローカル（既定） | `.data/attachments` |
| `ATLAS_ATTACHMENT_STORAGE=supabase` | Supabase（ローカルでも強制） |

## TTL削除

`/api/automations/tick` 実行時に `purgeExpiredAttachments()` を呼び出し、`temporary` かつ `expires_at` 経過分を Storage + DB から削除。
