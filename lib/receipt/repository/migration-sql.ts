/**
 * Inline SQL for Production apply / health probe.
 * Mirrors supabase/migrations/20260809_p1_05_household_ledger_entries.sql
 */
export const ATLAS_HOUSEHOLD_LEDGER_MIGRATION_SQL = `
-- P1-05: Household ledger entries — dedicated DB Single Source of Truth.
create table if not exists public.atlas_household_ledger_entries (
  id text primary key,
  user_id text not null,
  amount numeric(18, 2) not null default 0,
  currency text not null default 'JPY',
  occurred_at timestamptz not null,
  occurred_on date not null,
  category text not null default 'その他',
  merchant text not null default '',
  item_name text not null default '',
  description text not null default '',
  source text not null default 'receipt',
  receipt_id text,
  source_image_ids jsonb not null default '[]'::jsonb,
  quantity numeric(18, 4),
  unit_price numeric(18, 2),
  tax numeric(18, 2),
  payment_method text,
  money_use text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_household_ledger_entries_source_check
    check (source in ('receipt', 'manual', 'backfill', 'legacy'))
);

create index if not exists atlas_household_ledger_entries_user_date_idx
  on public.atlas_household_ledger_entries (user_id, occurred_on desc, id);

create index if not exists atlas_household_ledger_entries_user_category_idx
  on public.atlas_household_ledger_entries (user_id, category);

create index if not exists atlas_household_ledger_entries_user_receipt_idx
  on public.atlas_household_ledger_entries (user_id, receipt_id)
  where receipt_id is not null;

alter table public.atlas_household_ledger_entries enable row level security;

drop policy if exists "atlas_household_ledger_entries_deny_anon"
  on public.atlas_household_ledger_entries;
create policy "atlas_household_ledger_entries_deny_anon"
  on public.atlas_household_ledger_entries
  for all
  to anon, authenticated
  using (false)
  with check (false);
`;

export const HOUSEHOLD_LEDGER_TABLE = "atlas_household_ledger_entries" as const;
export const HOUSEHOLD_LEDGER_MIGRATION_NAME =
  "atlas_household_ledger_entries" as const;
