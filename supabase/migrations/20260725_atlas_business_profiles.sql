-- ATLAS Phase 6 business profiles: durable structured business data.
-- Apply in Supabase SQL editor when SUPABASE_SERVICE_ROLE_KEY is configured.
-- Writes use the service role key (bypasses RLS). Anon / authenticated cannot access.
-- Secrets are stored encrypted; logs and bindings keep field names only, not raw values.

create table if not exists public.atlas_business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  organization_id text,
  name text not null,
  profile_kind text not null default 'general',
  display_name text,
  full_name text,
  full_name_kana text,
  company_name text,
  trade_name text,
  department text,
  role_title text,
  representative_name text,
  postal_code text,
  address text,
  phone_main text,
  phone_direct text,
  fax text,
  email text,
  website text,
  business_hours text,
  signature_text text,
  greeting_text text,
  notice_text text,
  logo_path text,
  brand_color text,
  default_tone text,
  default_language text not null default 'ja',
  corporate_number text,
  invoice_registration_number text,
  license_number text,
  qualification_number text,
  registration_number text,
  bank_account_holder text,
  bank_name text,
  bank_branch text,
  bank_account_type text,
  bank_account_number_ciphertext text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  version int not null default 1,
  last_used_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists atlas_business_profiles_default_per_owner_idx
  on public.atlas_business_profiles (owner_user_id)
  where is_default and deleted_at is null;

create index if not exists atlas_business_profiles_owner_user_id_idx
  on public.atlas_business_profiles (owner_user_id);

create index if not exists atlas_business_profiles_organization_id_idx
  on public.atlas_business_profiles (organization_id);

create index if not exists atlas_business_profiles_deleted_at_idx
  on public.atlas_business_profiles (deleted_at);

alter table public.atlas_business_profiles enable row level security;

drop policy if exists "atlas_business_profiles_deny_anon"
  on public.atlas_business_profiles;

create policy "atlas_business_profiles_deny_anon"
  on public.atlas_business_profiles
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_profile_fields (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.atlas_business_profiles(id) on delete cascade,
  owner_user_id text not null,
  label text not null,
  key text not null,
  value_ciphertext text,
  value_plain text,
  value_type text not null,
  sensitivity_level text not null default 'internal',
  ai_usage_allowed boolean not null default false,
  document_usage_allowed boolean not null default true,
  automation_usage_allowed boolean not null default false,
  external_send_allowed boolean not null default false,
  require_confirmation boolean not null default false,
  usage_forbidden boolean not null default false,
  display_order int not null default 0,
  encryption_version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists atlas_business_profile_fields_profile_key_idx
  on public.atlas_business_profile_fields (profile_id, key)
  where deleted_at is null;

alter table public.atlas_business_profile_fields enable row level security;

drop policy if exists "atlas_business_profile_fields_deny_anon"
  on public.atlas_business_profile_fields;

create policy "atlas_business_profile_fields_deny_anon"
  on public.atlas_business_profile_fields
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  organization_id text,
  full_name text,
  full_name_kana text,
  company_name text,
  department text,
  role_title text,
  phone text,
  email text,
  postal_code text,
  address text,
  contact_kind text,
  memo text,
  source text,
  confidence numeric,
  last_confirmed_at timestamptz,
  version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_business_contacts_owner_user_id_idx
  on public.atlas_business_contacts (owner_user_id);

create index if not exists atlas_business_contacts_owner_full_name_idx
  on public.atlas_business_contacts (owner_user_id, full_name);

alter table public.atlas_business_contacts enable row level security;

drop policy if exists "atlas_business_contacts_deny_anon"
  on public.atlas_business_contacts;

create policy "atlas_business_contacts_deny_anon"
  on public.atlas_business_contacts
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_cases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  organization_id text,
  name text not null,
  reference_number text,
  case_kind text,
  status text,
  location text,
  start_date date,
  due_date date,
  assignee_name text,
  related_profile_id uuid references public.atlas_business_profiles(id) on delete set null,
  memo text,
  custom_fields jsonb not null default '{}'::jsonb,
  version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_business_cases enable row level security;

drop policy if exists "atlas_business_cases_deny_anon"
  on public.atlas_business_cases;

create policy "atlas_business_cases_deny_anon"
  on public.atlas_business_cases
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_business_case_contacts (
  case_id uuid not null references public.atlas_business_cases(id) on delete cascade,
  contact_id uuid not null references public.atlas_business_contacts(id) on delete cascade,
  owner_user_id text not null,
  relation_label text,
  primary key (case_id, contact_id)
);

alter table public.atlas_business_case_contacts enable row level security;

drop policy if exists "atlas_business_case_contacts_deny_anon"
  on public.atlas_business_case_contacts;

create policy "atlas_business_case_contacts_deny_anon"
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
  field_keys text[] not null default '{}'::text[],
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.atlas_artifact_data_bindings enable row level security;

drop policy if exists "atlas_artifact_data_bindings_deny_anon"
  on public.atlas_artifact_data_bindings;

create policy "atlas_artifact_data_bindings_deny_anon"
  on public.atlas_artifact_data_bindings
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_profile_usage_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  used_at timestamptz not null default now(),
  profile_id uuid references public.atlas_business_profiles(id) on delete set null,
  contact_id uuid references public.atlas_business_contacts(id) on delete set null,
  case_id uuid references public.atlas_business_cases(id) on delete set null,
  artifact_id text,
  artifact_label text,
  field_keys text[] not null default '{}'::text[],
  external_send boolean not null default false
);

alter table public.atlas_profile_usage_logs enable row level security;

drop policy if exists "atlas_profile_usage_logs_deny_anon"
  on public.atlas_profile_usage_logs;

create policy "atlas_profile_usage_logs_deny_anon"
  on public.atlas_profile_usage_logs
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists public.atlas_extracted_document_fields (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  case_id uuid references public.atlas_business_cases(id) on delete set null,
  contact_id uuid references public.atlas_business_contacts(id) on delete set null,
  source_file_name text,
  field_key text not null,
  field_value text,
  confidence numeric,
  page_number int,
  quote_snippet text,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_extracted_document_fields enable row level security;

drop policy if exists "atlas_extracted_document_fields_deny_anon"
  on public.atlas_extracted_document_fields;

create policy "atlas_extracted_document_fields_deny_anon"
  on public.atlas_extracted_document_fields
  for all
  to anon, authenticated
  using (false)
  with check (false);
