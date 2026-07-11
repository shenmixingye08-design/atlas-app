-- Projects table used by SupabaseProjectRepository and Commander durable persist.
-- Apply in Supabase SQL editor before enabling NEXT_PUBLIC_ATLAS_PROJECT_STORAGE=supabase.

create table if not exists public.projects (
  id text primary key,
  user_id text,
  title text not null,
  work_request text not null,
  status text not null,
  progress double precision not null default 0,
  assigned_employees jsonb not null default '[]'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);

alter table public.projects enable row level security;

-- Deny anon/authenticated. Server writes must use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Clerk JWT ↔ auth.uid() bridging is not enabled yet — do not open policies to anon.
drop policy if exists "projects_all" on public.projects;
drop policy if exists "projects_deny_anon" on public.projects;

create policy "projects_deny_anon"
  on public.projects
  for all
  to anon, authenticated
  using (false)
  with check (false);
