# Phase 6 業務プロフィール

## テーブル

`lib/business-profile/repository.ts` の table constants / Row 型を正とします。

- `atlas_business_profiles`
- `atlas_business_profile_fields`
- `atlas_business_contacts`
- `atlas_business_cases`
- `atlas_business_case_contacts`
- `atlas_artifact_data_bindings`
- `atlas_profile_usage_logs`

全テーブルに `owner_user_id` を持たせ、プロフィール・フィールド・連絡先・案件は `deleted_at` で soft delete します。口座番号は `bank_account_number_encrypted` と `bank_account_number_last4` のみ保存し、API/UI には full number を返しません。

## RLS

全テーブルで RLS を有効化し、`anon` / `authenticated` は deny-all です。アプリの CRUD は Clerk の `auth().userId` を owner とし、Supabase service role で server-side からだけ実行します。

## AI へ渡さない情報

AI 用プレビューや orchestration metadata は `sanitizeContextForAI` の結果のみを使用します。

- 口座番号・銀行系フィールドは AI に渡しません
- `aiUsageAllowed=false` / `usageForbidden=true` の項目は渡しません
- usage log は field key のみを記録し、値は記録しません

UI 確認用の document fields は `documentUsageAllowed` の項目を返せますが、口座番号系は last4 マスクのみです。

## Supabase 適用手順

1. `.env.local` / Vercel に `ATLAS_BUSINESS_PROFILE_ENCRYPTION_KEY` を設定します。
   - 生成例: `openssl rand -hex 32`
2. Supabase SQL editor で `supabase/migrations/20260725_atlas_business_profiles.sql` を適用します。
3. `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を server 環境に設定します。
4. `/settings/business-profile` で作成・編集・削除・export を確認します。

旧 Phase 6 migration を適用済みの環境でも、同 migration は repository が使う列を `add column if not exists` で補います。
