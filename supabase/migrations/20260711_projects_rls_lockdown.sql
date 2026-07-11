-- Lock down projects if an open policy was previously applied.
alter table if exists public.projects enable row level security;

drop policy if exists "projects_all" on public.projects;
drop policy if exists "projects_deny_anon" on public.projects;

create policy "projects_deny_anon"
  on public.projects
  for all
  to anon, authenticated
  using (false)
  with check (false);
