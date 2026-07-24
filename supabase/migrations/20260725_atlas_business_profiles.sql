-- ATLAS Phase 6 business profiles.
-- Source of truth: lib/business-profile/repository.ts table constants and Row types.
-- All browser roles are denied by RLS; server writes use the Supabase service role.

create extension if not exists pgcrypto;

create table if not exists public.atlas_business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  kind text,
  display_name text,
  company_name text,
  legal_name text,
  department text,
  postal_code text,
  address_line1 text,
  address_line2 text,
  phone text,
  email text,
  website_url text,
  invoice_registration_number text,
  corporate_number text,
  bank_name text,
  bank_branch_name text,
  bank_account_type text,
  bank_account_number_encrypted text,
  bank_account_number_last4 text,
  bank_account_holder text,
  notes text,
  is_default boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.atlas_business_profiles
  add column if not exists owner_user_id text,
  add column if not exists kind text,
  add column if not exists display_name text,
  add column if not exists company_name text,
  add column if not exists legal_name text,
  add column if not exists department text,
  add column if not exists postal_code text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website_url text,
  add column if not exists invoice_registration_number text,
  add column if not exists corporate_number text,
  add column if not exists bank_name text,
  add column if not exists bank_branch_name text,
  add column if not exists bank_account_type text,
  add column if not exists bank_account_number_encrypted text,
  add column if not exists bank_account_number_last4 text,
  add column if not exists bank_account_holder text,
  add column if not exists notes text,
  add column if not exists is_default boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists deleted_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atlas_business_profiles'
      and column_name = 'name'
  ) then
    alter table public.atlas_business_profiles alter column name drop not null;
  end if;
end $$;

alter table public.atlas_business_profiles
  alter column owner_user_id set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

create unique index if not exists atlas_business_profiles_default_per_owner_idx
  on public.atlas_business_profiles (owner_user_id)
  where is_default and deleted_at is null;

create index if not exists atlas_business_profiles_owner_user_id_idx
  on public.atlas_business_profiles (owner_user_id);

create index if not exists atlas_business_profiles_deleted_at_idx
  on public.atlas_business_profiles (deleted_at);

alter table public.atlas_business_profiles enable row level security;

drop policy if exists atlas_business_profiles_deny_all
  on public.atlas_business_profiles;
drop policy if exists "atlas_business_profiles_deny_anon"
  on public.atlas_business_profiles;

create policy atlas_business_profiles_deny_all
  on public.atlas_business_profiles
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_profile_fields (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  profile_id uuid not null references public.atlas_business_profiles(id) on delete cascade,
  field_key text not null,
  label text not null,
  value_text text,
  secret_value_encrypted text,
  has_secret_value boolean default false,
  value_type text,
  sensitivity text,
  ai_usage_allowed boolean default true,
  document_usage_allowed boolean default true,
  usage_forbidden boolean default false,
  source_kind text,
  source_detail text,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.atlas_business_profile_fields
  add column if not exists owner_user_id text,
  add column if not exists profile_id uuid,
  add column if not exists field_key text,
  add column if not exists label text,
  add column if not exists value_text text,
  add column if not exists secret_value_encrypted text,
  add column if not exists has_secret_value boolean default false,
  add column if not exists value_type text,
  add column if not exists sensitivity text,
  add column if not exists ai_usage_allowed boolean default true,
  add column if not exists document_usage_allowed boolean default true,
  add column if not exists usage_forbidden boolean default false,
  add column if not exists source_kind text,
  add column if not exists source_detail text,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists deleted_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atlas_business_profile_fields'
      and column_name = 'key'
  ) then
    alter table public.atlas_business_profile_fields alter column key drop not null;
  end if;
end $$;

alter table public.atlas_business_profile_fields
  alter column owner_user_id set not null,
  alter column profile_id set not null,
  alter column field_key set not null,
  alter column label set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_business_profile_fields_profile_id_fkey'
      and conrelid = 'public.atlas_business_profile_fields'::regclass
  ) then
    alter table public.atlas_business_profile_fields
      add constraint atlas_business_profile_fields_profile_id_fkey
      foreign key (profile_id)
      references public.atlas_business_profiles(id)
      on delete cascade;
  end if;
end $$;

drop index if exists atlas_business_profile_fields_profile_key_idx;
create unique index if not exists atlas_business_profile_fields_owner_profile_key_idx
  on public.atlas_business_profile_fields (owner_user_id, profile_id, field_key);

create index if not exists atlas_business_profile_fields_owner_profile_idx
  on public.atlas_business_profile_fields (owner_user_id, profile_id);

alter table public.atlas_business_profile_fields enable row level security;

drop policy if exists atlas_business_profile_fields_deny_all
  on public.atlas_business_profile_fields;
drop policy if exists "atlas_business_profile_fields_deny_anon"
  on public.atlas_business_profile_fields;

create policy atlas_business_profile_fields_deny_all
  on public.atlas_business_profile_fields
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  profile_id uuid references public.atlas_business_profiles(id) on delete set null,
  kind text,
  display_name text,
  company_name text,
  department text,
  title text,
  email text,
  phone text,
  address text,
  notes text,
  is_primary boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.atlas_business_contacts
  add column if not exists owner_user_id text,
  add column if not exists profile_id uuid,
  add column if not exists kind text,
  add column if not exists display_name text,
  add column if not exists company_name text,
  add column if not exists department text,
  add column if not exists title text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists is_primary boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists deleted_at timestamptz;

alter table public.atlas_business_contacts
  alter column owner_user_id set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_business_contacts_profile_id_fkey'
      and conrelid = 'public.atlas_business_contacts'::regclass
  ) then
    alter table public.atlas_business_contacts
      add constraint atlas_business_contacts_profile_id_fkey
      foreign key (profile_id)
      references public.atlas_business_profiles(id)
      on delete set null;
  end if;
end $$;

create index if not exists atlas_business_contacts_owner_user_id_idx
  on public.atlas_business_contacts (owner_user_id);

create index if not exists atlas_business_contacts_profile_id_idx
  on public.atlas_business_contacts (profile_id);

create index if not exists atlas_business_contacts_deleted_at_idx
  on public.atlas_business_contacts (deleted_at);

alter table public.atlas_business_contacts enable row level security;

drop policy if exists atlas_business_contacts_deny_all
  on public.atlas_business_contacts;
drop policy if exists "atlas_business_contacts_deny_anon"
  on public.atlas_business_contacts;

create policy atlas_business_contacts_deny_all
  on public.atlas_business_contacts
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_cases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  profile_id uuid references public.atlas_business_profiles(id) on delete set null,
  kind text,
  title text,
  client_name text,
  description text,
  status text,
  start_date text,
  end_date text,
  budget text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.atlas_business_cases
  add column if not exists owner_user_id text,
  add column if not exists profile_id uuid,
  add column if not exists kind text,
  add column if not exists title text,
  add column if not exists client_name text,
  add column if not exists description text,
  add column if not exists status text,
  add column if not exists start_date text,
  add column if not exists end_date text,
  add column if not exists budget text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists deleted_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atlas_business_cases'
      and column_name = 'name'
  ) then
    alter table public.atlas_business_cases alter column name drop not null;
  end if;
end $$;

alter table public.atlas_business_cases
  alter column owner_user_id set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_business_cases_profile_id_fkey'
      and conrelid = 'public.atlas_business_cases'::regclass
  ) then
    alter table public.atlas_business_cases
      add constraint atlas_business_cases_profile_id_fkey
      foreign key (profile_id)
      references public.atlas_business_profiles(id)
      on delete set null;
  end if;
end $$;

create index if not exists atlas_business_cases_owner_user_id_idx
  on public.atlas_business_cases (owner_user_id);

create index if not exists atlas_business_cases_profile_id_idx
  on public.atlas_business_cases (profile_id);

create index if not exists atlas_business_cases_deleted_at_idx
  on public.atlas_business_cases (deleted_at);

alter table public.atlas_business_cases enable row level security;

drop policy if exists atlas_business_cases_deny_all
  on public.atlas_business_cases;
drop policy if exists "atlas_business_cases_deny_anon"
  on public.atlas_business_cases;

create policy atlas_business_cases_deny_all
  on public.atlas_business_cases
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_case_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  case_id uuid not null references public.atlas_business_cases(id) on delete cascade,
  contact_id uuid not null references public.atlas_business_contacts(id) on delete cascade,
  role text,
  created_at timestamptz not null default now()
);

alter table public.atlas_business_case_contacts
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists owner_user_id text,
  add column if not exists case_id uuid,
  add column if not exists contact_id uuid,
  add column if not exists role text,
  add column if not exists created_at timestamptz default now();

alter table public.atlas_business_case_contacts
  alter column owner_user_id set not null,
  alter column case_id set not null,
  alter column contact_id set not null,
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_business_case_contacts_id_key'
      and conrelid = 'public.atlas_business_case_contacts'::regclass
  ) then
    alter table public.atlas_business_case_contacts
      add constraint atlas_business_case_contacts_id_key unique (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_business_case_contacts_case_id_fkey'
      and conrelid = 'public.atlas_business_case_contacts'::regclass
  ) then
    alter table public.atlas_business_case_contacts
      add constraint atlas_business_case_contacts_case_id_fkey
      foreign key (case_id)
      references public.atlas_business_cases(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'atlas_business_case_contacts_contact_id_fkey'
      and conrelid = 'public.atlas_business_case_contacts'::regclass
  ) then
    alter table public.atlas_business_case_contacts
      add constraint atlas_business_case_contacts_contact_id_fkey
      foreign key (contact_id)
      references public.atlas_business_contacts(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists atlas_business_case_contacts_case_contact_idx
  on public.atlas_business_case_contacts (case_id, contact_id);

create index if not exists atlas_business_case_contacts_owner_user_id_idx
  on public.atlas_business_case_contacts (owner_user_id);

alter table public.atlas_business_case_contacts enable row level security;

drop policy if exists atlas_business_case_contacts_deny_all
  on public.atlas_business_case_contacts;
drop policy if exists "atlas_business_case_contacts_deny_anon"
  on public.atlas_business_case_contacts;

create policy atlas_business_case_contacts_deny_all
  on public.atlas_business_case_contacts
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_artifact_data_bindings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  artifact_id text not null,
  profile_id uuid references public.atlas_business_profiles(id) on delete set null,
  contact_id uuid references public.atlas_business_contacts(id) on delete set null,
  case_id uuid references public.atlas_business_cases(id) on delete set null,
  field_keys text[],
  created_at timestamptz not null default now()
);

alter table public.atlas_artifact_data_bindings
  add column if not exists owner_user_id text,
  add column if not exists artifact_id text,
  add column if not exists profile_id uuid,
  add column if not exists contact_id uuid,
  add column if not exists case_id uuid,
  add column if not exists field_keys text[],
  add column if not exists created_at timestamptz default now();

alter table public.atlas_artifact_data_bindings
  alter column owner_user_id set not null,
  alter column artifact_id set not null,
  alter column created_at set not null;

create index if not exists atlas_artifact_data_bindings_owner_user_id_idx
  on public.atlas_artifact_data_bindings (owner_user_id);

create index if not exists atlas_artifact_data_bindings_artifact_id_idx
  on public.atlas_artifact_data_bindings (artifact_id);

alter table public.atlas_artifact_data_bindings enable row level security;

drop policy if exists atlas_artifact_data_bindings_deny_all
  on public.atlas_artifact_data_bindings;
drop policy if exists "atlas_artifact_data_bindings_deny_anon"
  on public.atlas_artifact_data_bindings;

create policy atlas_artifact_data_bindings_deny_all
  on public.atlas_artifact_data_bindings
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_profile_usage_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  profile_id uuid references public.atlas_business_profiles(id) on delete set null,
  contact_id uuid references public.atlas_business_contacts(id) on delete set null,
  case_id uuid references public.atlas_business_cases(id) on delete set null,
  artifact_id text,
  purpose text,
  field_keys text[],
  created_at timestamptz not null default now()
);

alter table public.atlas_profile_usage_logs
  add column if not exists owner_user_id text,
  add column if not exists profile_id uuid,
  add column if not exists contact_id uuid,
  add column if not exists case_id uuid,
  add column if not exists artifact_id text,
  add column if not exists purpose text,
  add column if not exists field_keys text[],
  add column if not exists created_at timestamptz default now();

alter table public.atlas_profile_usage_logs
  alter column owner_user_id set not null,
  alter column created_at set not null;

create index if not exists atlas_profile_usage_logs_owner_user_id_idx
  on public.atlas_profile_usage_logs (owner_user_id);

create index if not exists atlas_profile_usage_logs_created_at_idx
  on public.atlas_profile_usage_logs (created_at desc);

alter table public.atlas_profile_usage_logs enable row level security;

drop policy if exists atlas_profile_usage_logs_deny_all
  on public.atlas_profile_usage_logs;
drop policy if exists "atlas_profile_usage_logs_deny_anon"
  on public.atlas_profile_usage_logs;

create policy atlas_profile_usage_logs_deny_all
  on public.atlas_profile_usage_logs
  for all
  to anon, authenticated
  using (false)
  with check (false);
