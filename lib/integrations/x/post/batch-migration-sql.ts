export const ATLAS_X_POST_BATCH_MIGRATION_SQL = `
create table if not exists public.atlas_x_post_batches (
  batch_id text primary key,
  owner_id text not null,
  purpose text not null default '',
  theme text not null default '',
  audience text not null default '',
  tone text not null default '',
  include_content text not null default '',
  forbidden_content text not null default '',
  hashtag_policy text not null default '',
  requested_count integer not null,
  start_date text not null,
  end_date text not null,
  days_of_week jsonb not null default '[]'::jsonb,
  post_time text not null default '10:00',
  approval_mode text not null default 'approval',
  timezone text not null default 'Asia/Tokyo',
  status text not null default 'draft',
  cancel_requested boolean not null default false,
  generation_attempts integer not null default 0,
  cost_usd numeric not null default 0,
  memory_applied boolean not null default false,
  memory_labels jsonb not null default '[]'::jsonb,
  memory_failed boolean not null default false,
  connection_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_x_post_batches_owner_created_idx
  on public.atlas_x_post_batches (owner_id, created_at desc);

alter table public.atlas_x_post_batches enable row level security;

drop policy if exists "atlas_x_post_batches_deny_anon"
  on public.atlas_x_post_batches;
create policy "atlas_x_post_batches_deny_anon"
  on public.atlas_x_post_batches
  for all to anon, authenticated
  using (false) with check (false);

create table if not exists public.atlas_x_post_batch_items (
  item_id text primary key,
  batch_id text not null,
  owner_id text not null,
  text text not null default '',
  angle text not null default '',
  theme text not null default '',
  hashtags jsonb not null default '[]'::jsonb,
  sequence integer not null,
  approval_status text not null default 'pending',
  scheduled_for timestamptz,
  status text not null default 'draft',
  error_message text,
  regenerate_count integer not null default 0,
  x_post_job_id text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists atlas_x_post_batch_items_batch_sequence_uidx
  on public.atlas_x_post_batch_items (batch_id, sequence);

alter table public.atlas_x_post_batch_items enable row level security;

drop policy if exists "atlas_x_post_batch_items_deny_anon"
  on public.atlas_x_post_batch_items;
create policy "atlas_x_post_batch_items_deny_anon"
  on public.atlas_x_post_batch_items
  for all to anon, authenticated
  using (false) with check (false);
`;
