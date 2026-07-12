-- Phase1: lock down atlas_user_state if the open policy was already applied.
alter table if exists public.atlas_user_state enable row level security;

drop policy if exists "atlas_user_state_all" on public.atlas_user_state;
drop policy if exists "atlas_user_state_deny_anon" on public.atlas_user_state;

create policy "atlas_user_state_deny_anon"
  on public.atlas_user_state
  for all
  to anon, authenticated
  using (false)
  with check (false);
