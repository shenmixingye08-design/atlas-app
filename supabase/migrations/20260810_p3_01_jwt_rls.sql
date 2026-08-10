-- P3-01: JWT連携RLS (Clerk userId ↔ auth.jwt()->>'sub')
-- SAFE: additive. OAuth/credential tables remain deny-all (service role only).
-- Authenticated access requires a Supabase-compatible JWT with matching sub.

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

-- Anon: always deny (no JWT bridge for anonymous).
drop policy if exists "atlas_jwt_rls_subjects_deny_anon" on public.atlas_jwt_rls_subjects;
create policy "atlas_jwt_rls_subjects_deny_anon"
  on public.atlas_jwt_rls_subjects
  for all
  to anon
  using (false)
  with check (false);

-- Authenticated: Clerk/user JWT sub must match row user_id.
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

comment on table public.atlas_jwt_rls_subjects is
  'P3-01 JWT連携RLS subjects. Authenticated JWT sub must equal user_id. Service role bypasses RLS.';

-- projects: enable JWT-linked access for own rows (Clerk sub ↔ user_id).
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
