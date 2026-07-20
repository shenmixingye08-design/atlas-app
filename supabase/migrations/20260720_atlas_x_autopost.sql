-- ATLAS X (Twitter) AI auto-post: per-user settings + run history (idempotency).
-- Apply in the Supabase SQL editor when SUPABASE_SERVICE_ROLE_KEY is configured.
-- Writes use the service role key (bypasses RLS). Anon / authenticated cannot access.
-- No X tokens are stored here; only auto-post preferences and post run history.

-- 1) Per-user auto-post settings (source of truth for the scheduled job).
create table if not exists public.atlas_x_autopost_settings (
  user_id text primary key,
  enabled boolean not null default false,
  mode text not null default 'approval',            -- 'full_auto' | 'approval'
  purpose text not null default '',                  -- 商品宣伝 / 見込み客獲得 ...
  themes jsonb not null default '[]'::jsonb,          -- string[]
  audience text not null default '',                  -- 個人事業主 / 中小企業 ...
  tone text not null default '',                      -- 丁寧 / 親しみやすい ...
  frequency text not null default 'daily_1',          -- daily_1|daily_2|daily_3|weekly_1|weekly_3|custom
  days_of_week jsonb not null default '[]'::jsonb,     -- number[] 0(Sun)-6(Sat), used for weekly/custom
  post_times jsonb not null default '["09:00"]'::jsonb,-- string[] "HH:mm" in Asia/Tokyo
  timezone text not null default 'Asia/Tokyo',
  include_hashtags boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_x_autopost_settings_enabled_idx
  on public.atlas_x_autopost_settings (enabled);

alter table public.atlas_x_autopost_settings enable row level security;

drop policy if exists "atlas_x_autopost_settings_deny_anon"
  on public.atlas_x_autopost_settings;

create policy "atlas_x_autopost_settings_deny_anon"
  on public.atlas_x_autopost_settings
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- 2) Auto-post run history + idempotency ledger.
-- Unique (user_id, slot_key) guarantees one run per scheduled slot even if the
-- cron fires twice (Vercel retry / overlapping ticks) -> no double posts.
create table if not exists public.atlas_x_autopost_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slot_key text not null,                            -- "YYYY-MM-DDTHH:mm" (JST)
  scheduled_for timestamptz,
  status text not null default 'processing',          -- processing|posted|drafted|failed|skipped
  mode text not null default 'approval',              -- full_auto|approval
  post_type text,
  text text,
  tweet_id text,
  tweet_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot_key)
);

create index if not exists atlas_x_autopost_runs_user_idx
  on public.atlas_x_autopost_runs (user_id, created_at desc);

alter table public.atlas_x_autopost_runs enable row level security;

drop policy if exists "atlas_x_autopost_runs_deny_anon"
  on public.atlas_x_autopost_runs;

create policy "atlas_x_autopost_runs_deny_anon"
  on public.atlas_x_autopost_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);
