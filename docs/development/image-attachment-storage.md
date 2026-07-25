# 画像添付ストレージ（Supabase Storage）

## バケット

- 名前: `atlas-image-attachments`
- 公開: **非公開**（`public = false`）
- 適用SQL: `supabase/migrations/20260726_atlas_image_attachments.sql`

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

署名付きURLは短時間（60秒）ヘルパーのみ。OpenAI経路では使わない。

## バックエンド切替

| 環境 | 保存先 |
|------|--------|
| `VERCEL_ENV=production` / `preview` | **必ず Supabase** |
| ローカル（既定） | `.data/attachments` |
| `ATLAS_ATTACHMENT_STORAGE=supabase` | Supabase（ローカルでも強制） |

## TTL削除

`/api/automations/tick` 実行時に `purgeExpiredAttachments()` を呼び出し、`temporary` かつ `expires_at` 経過分を Storage + DB から削除。
