/**
 * Inline SQL for Production serverless apply (P3-01).
 * Keep in sync with supabase/migrations/20260810_p3_01_jwt_rls.sql.
 */
export const ATLAS_JWT_RLS_MIGRATION_SQL = `
create table if not exists public.atlas_jwt_rls_subjects (
  id text primary key,
  user_id text not null,
  correlation_id text not null,
  label text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists atlas_jwt_rls_subjects_user_idx
  on public.atlas_jwt_rls_subjects (user_id, created_at desc);
create index if not exists atlas_jwt_rls_subjects_corr_idx
  on public.atlas_jwt_rls_subjects (correlation_id, created_at desc);

alter table public.atlas_jwt_rls_subjects enable row level security;

drop policy if exists "atlas_jwt_rls_subjects_deny_anon" on public.atlas_jwt_rls_subjects;
create policy "atlas_jwt_rls_subjects_deny_anon"
  on public.atlas_jwt_rls_subjects
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists "atlas_jwt_rls_subjects_select_own" on public.atlas_jwt_rls_subjects;
create policy "atlas_jwt_rls_subjects_select_own"
  on public.atlas_jwt_rls_subjects
  for select
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "atlas_jwt_rls_subjects_insert_own" on public.atlas_jwt_rls_subjects;
create policy "atlas_jwt_rls_subjects_insert_own"
  on public.atlas_jwt_rls_subjects
  for insert
  to authenticated
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "atlas_jwt_rls_subjects_update_own" on public.atlas_jwt_rls_subjects;
create policy "atlas_jwt_rls_subjects_update_own"
  on public.atlas_jwt_rls_subjects
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

drop policy if exists "atlas_jwt_rls_subjects_delete_own" on public.atlas_jwt_rls_subjects;
create policy "atlas_jwt_rls_subjects_delete_own"
  on public.atlas_jwt_rls_subjects
  for delete
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'));

create table if not exists public.atlas_jwt_rls_bridge_secret (
  id text primary key,
  secret text not null,
  source text not null default 'unknown',
  updated_at timestamptz not null default now(),
  constraint atlas_jwt_rls_bridge_secret_singleton check (id = 'default')
);

alter table public.atlas_jwt_rls_bridge_secret enable row level security;

drop policy if exists "atlas_jwt_rls_bridge_secret_deny_all" on public.atlas_jwt_rls_bridge_secret;
create policy "atlas_jwt_rls_bridge_secret_deny_all"
  on public.atlas_jwt_rls_bridge_secret
  for all
  to anon, authenticated
  using (false)
  with check (false);

do $$
begin
  if to_regclass('public.projects') is null then
    return;
  end if;

  -- Narrow legacy deny-all so authenticated can use JWT policies (OR).
  drop policy if exists "projects_deny_anon" on public.projects;
  create policy "projects_deny_anon"
    on public.projects
    for all
    to anon
    using (false)
    with check (false);

  drop policy if exists "projects_jwt_select_own" on public.projects;
  create policy "projects_jwt_select_own"
    on public.projects
    for select
    to authenticated
    using (user_id is not null and user_id = (auth.jwt() ->> 'sub'));

  drop policy if exists "projects_jwt_insert_own" on public.projects;
  create policy "projects_jwt_insert_own"
    on public.projects
    for insert
    to authenticated
    with check (user_id is not null and user_id = (auth.jwt() ->> 'sub'));

  drop policy if exists "projects_jwt_update_own" on public.projects;
  create policy "projects_jwt_update_own"
    on public.projects
    for update
    to authenticated
    using (user_id is not null and user_id = (auth.jwt() ->> 'sub'))
    with check (user_id is not null and user_id = (auth.jwt() ->> 'sub'));

  drop policy if exists "projects_jwt_delete_own" on public.projects;
  create policy "projects_jwt_delete_own"
    on public.projects
    for delete
    to authenticated
    using (user_id is not null and user_id = (auth.jwt() ->> 'sub'));
end
$$;
`.trim();

export const ATLAS_JWT_RLS_MIGRATION_NAME = "20260810_p3_01_jwt_rls";
