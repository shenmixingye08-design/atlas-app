# Pre-production Supabase migration audit

目的: `supabase/migrations` の Phase 1〜5 に関係する SQL を、適用順・影響・RLS/Index/Storage Policy・rollback 方針つきで整理する。  
このエージェント環境から remote Supabase の適用状況は確認していないため、全ファイルの適用状況は **未確認**。

## Apply order summary

| 適用順 | Phase | ファイル名 | 目的 | 適用済みか | 既存データへの影響 | RLS | Index | Storage Policy | ロールバック方法 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Phase 1: durable user state | `20260711_atlas_user_state.sql` | Clerk privateMetadata overflow / Work Memory / Learning / Notifications / Automations 等の user-scoped JSON durable store | 未確認 | `create table if not exists`。既存tableがあれば保持。policyは既存 open/deny policy を drop/recreate | `atlas_user_state` RLS enabled。`anon, authenticated` は deny-all。service role 前提 | Primary key `(user_id, domain)` のみ | なし | `drop policy if exists "atlas_user_state_deny_anon"; drop table if exists public.atlas_user_state;`。本番rollback前に payload backup 必須 |
| 2 | Phase 1: durable user state lockdown | `20260711_atlas_user_state_rls_lockdown.sql` | 既に open policy が入っていた場合の deny-all lockdown | 未確認 | dataは変更しない。policyのみ変更 | RLS enabled。open policyを削除して deny-all | なし | なし | `drop policy if exists "atlas_user_state_deny_anon" on public.atlas_user_state;`。tableは残す |
| 3 | Phase 1: projects durable store | `20260711_projects.sql` | Commander / project persistence 用 `projects` table | 未確認 | `create table if not exists`。既存tableがあれば保持。policyは既存 open/deny policy を drop/recreate | `projects` RLS enabled。`anon, authenticated` は deny-all。service role writes 前提 | `projects_user_id_idx`, `projects_updated_at_idx` | なし | `drop policy if exists "projects_deny_anon"; drop table if exists public.projects;`。本番rollback前に projects backup 必須 |
| 4 | Phase 1: projects lockdown | `20260711_projects_rls_lockdown.sql` | 既に open policy が入っていた場合の projects deny-all lockdown | 未確認 | dataは変更しない。policyのみ変更 | RLS enabled。open policyを削除して deny-all | なし | なし | `drop policy if exists "projects_deny_anon" on public.projects;`。tableは残す |
| 5 | Phase 2: billing durability | `20260713_atlas_billing_subscriptions.sql` | Stripe subscription state と webhook idempotency を `.data` ではなく Supabase に保存 | 未確認 | `create table if not exists`。既存subscription rowは保持。billing state table追加 | `atlas_billing_subscriptions`, `atlas_stripe_webhook_events` RLS enabled。deny-all | customer id partial index, subscription id partial index, webhook event primary key | なし | `drop policy ...; drop table if exists public.atlas_stripe_webhook_events; drop table if exists public.atlas_billing_subscriptions;`。subscription/idempotency backup 必須 |
| 6 | Phase 2: Google OAuth durability | `20260713_atlas_google_oauth_credentials.sql` | Google OAuth token / account metadata を server-only table に保存 | 未確認 | `create table if not exists`。既存tableがあれば保持。token格納先を追加 | `atlas_google_oauth_credentials` RLS enabled。deny-all | `atlas_google_oauth_credentials_status_idx` | なし | `drop policy ...; drop table if exists public.atlas_google_oauth_credentials;`。接続解除扱いになるため token backup/再連携計画必須 |
| 7 | Phase 2: WordPress credentials durability | `20260713_atlas_wordpress_credentials.sql` | WordPress Application Password の暗号化保存 | 未確認 | `create table if not exists`。既存tableがあれば保持。暗号化credential格納先を追加 | `atlas_wordpress_credentials` RLS enabled。deny-all | `atlas_wordpress_credentials_status_idx` | なし | `drop policy ...; drop table if exists public.atlas_wordpress_credentials;`。credential復元不可に注意、再連携計画必須 |
| 8 | Phase 2: X OAuth durability | `20260713_atlas_x_oauth_credentials.sql` | X OAuth token / account metadata を server-only table に保存 | 未確認 | `create table if not exists`。既存tableがあれば保持。X token格納先を追加 | `atlas_x_oauth_credentials` RLS enabled。deny-all | `atlas_x_oauth_credentials_status_idx` | なし | `drop policy ...; drop table if exists public.atlas_x_oauth_credentials;`。X再連携が必要になる可能性 |
| 9 | Phase 3: X auto-post | `20260720_atlas_x_autopost.sql` | X自動投稿 settings と slot idempotency run history | 未確認 | `create table if not exists`。既存tableがあれば保持。settings/runs table追加。unique `(user_id, slot_key)` で二重投稿抑制 | `atlas_x_autopost_settings`, `atlas_x_autopost_runs` RLS enabled。deny-all | settings enabled index, runs user/created index, runs unique `(user_id, slot_key)` | なし | `drop policy ...; drop table if exists public.atlas_x_autopost_runs; drop table if exists public.atlas_x_autopost_settings;`。run ledger削除で重複投稿リスク |
| 10 | Phase 4: Web Push | `20260722_atlas_push_subscriptions.sql` | Web Push subscription を multi-device per user で保存 | 未確認 | `create table if not exists`。既存tableがあれば保持。subscription table追加。unique `(user_id, endpoint)` | `atlas_push_subscriptions` RLS enabled。deny-all | `atlas_push_subscriptions_user_active_idx`, unique `(user_id, endpoint)` | なし | `drop policy ...; drop table if exists public.atlas_push_subscriptions;`。全端末のpush再登録が必要 |
| 11 | Phase 5: automation job reliability | `20260722_atlas_automation_jobs.sql` | durable automation job queue、retry/stale-running/idempotency/push status | 未確認 | `create table if not exists`。既存tableがあれば保持。job lifecycle source of truth 追加。unique `idempotency_key` | `atlas_automation_jobs` RLS enabled。deny-all | user/status, automation/scheduled, retry partial, running stale partial, unique `idempotency_key` | なし | `drop policy ...; drop table if exists public.atlas_automation_jobs;`。queued/running/retry履歴が失われるため drain/backup 必須 |

## Phase notes

### Phase 1: user/project durability

- `atlas_user_state` は user/domain 単位の JSON overflow store。
- `projects` は Commander durable upsert / project persistence 用。
- どちらも browser anon/authenticated には開けず、server service role 経由で操作する設計。
- `*_rls_lockdown.sql` は過去に open policy が適用された場合の補正用で、dataを削除しない。

### Phase 2: billing and external credentials

- Billing は subscription state と webhook idempotency を Supabase に移し、serverless の `.data` 依存を避ける。
- Google / X OAuth token と WordPress credential は server-only table。browser APIには返さない前提。
- WordPress は `ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY` による AES-256-GCM 暗号化credentialを保存する。

### Phase 3: X auto-post

- `atlas_x_autopost_settings` が per-user settings。
- `atlas_x_autopost_runs` は slot idempotency ledger。`unique (user_id, slot_key)` が二重投稿防止の中心。
- rollbackで runs を消すと、同じ slot が再処理されるリスクがある。

### Phase 4: Web Push

- `atlas_push_subscriptions` は endpoint/key を保存するため、端末再登録が必要になる可能性がある。
- Storage bucket/policy は使っていない。

### Phase 5: automation job reliability

- `atlas_automation_jobs` は job lifecycle の durable queue。
- partial index により retry対象と stale running 検出を支援。
- rollback前に queued/running/retrying jobs を drain すること。

## Common verification checklist

1. Supabase SQL Editor または CLI で上記順に実行。
2. Table Editor で各 table の存在確認。
3. Authentication → Policies で deny-all policy があることを確認。
4. Service role 経由の server writes が成功することを確認。
5. `anon` / `authenticated` client から直接 read/write できないことを確認。
6. remote適用状況は repo から推測しない。必ず Supabase dashboard / migration table / CLI で確認する。
