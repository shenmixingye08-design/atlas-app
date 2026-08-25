-- Deliverable batch create (まとめて作成).
-- Parent batch + child items. Service role writes only.
-- Process memory is the test SoT; this table is production durability.
-- SAFE: additive. Does not alter atlas_work_jobs or deliverable generators.

create table if not exists public.atlas_deliverable_batches (
  id text not null,
  user_id text not null,
  name text not null default 'まとめて作成',
  input_type text not null,
  common jsonb not null default '{}'::jsonb,
  format text not null,
  requested_count integer not null,
  status text not null,
  sample_item_id text,
  sample_approved boolean not null default false,
  sample_style_note text,
  style_candidate text,
  duplicate_warnings jsonb not null default '[]'::jsonb,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint atlas_deliverable_batches_count_chk
    check (requested_count >= 1 and requested_count <= 12)
);

create index if not exists atlas_deliverable_batches_user_updated_idx
  on public.atlas_deliverable_batches (user_id, updated_at desc);

create table if not exists public.atlas_deliverable_batch_items (
  id text not null,
  batch_id text not null,
  user_id text not null,
  order_index integer not null,
  input_type text not null,
  input_reference text,
  title text not null,
  theme text not null default '',
  individual_instruction text not null default '',
  forbidden text not null default '',
  file_name text,
  output_format text not null,
  output_artifact_id text,
  work_job_id text,
  source_content text,
  status text not null,
  retry_count integer not null default 0,
  error text,
  edited boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint atlas_deliverable_batch_items_batch_fk
    foreign key (user_id, batch_id)
    references public.atlas_deliverable_batches (user_id, id)
    on delete cascade
);

create unique index if not exists atlas_deliverable_batch_items_order_idx
  on public.atlas_deliverable_batch_items (user_id, batch_id, order_index);

create index if not exists atlas_deliverable_batch_items_batch_idx
  on public.atlas_deliverable_batch_items (user_id, batch_id);

create index if not exists atlas_deliverable_batch_items_artifact_idx
  on public.atlas_deliverable_batch_items (user_id, output_artifact_id)
  where output_artifact_id is not null;

alter table public.atlas_deliverable_batches enable row level security;
alter table public.atlas_deliverable_batch_items enable row level security;

drop policy if exists "atlas_deliverable_batches_deny_all"
  on public.atlas_deliverable_batches;
create policy "atlas_deliverable_batches_deny_all"
  on public.atlas_deliverable_batches
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "atlas_deliverable_batch_items_deny_all"
  on public.atlas_deliverable_batch_items;
create policy "atlas_deliverable_batch_items_deny_all"
  on public.atlas_deliverable_batch_items
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.atlas_deliverable_batches is
  'まとめて作成 parent batch. Clients cannot read/write; API uses service role after Clerk ownership check. Operational retention: 90 days.';

comment on table public.atlas_deliverable_batch_items is
  'まとめて作成 child items. One item = one existing generateDeliverables job. Deny-all RLS.';
