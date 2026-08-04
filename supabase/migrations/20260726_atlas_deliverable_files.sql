-- Durable deliverable file store for Word/PDF/etc downloads across serverless instances.
-- Memory Map alone fails when generate and GET hit different instances.
-- Server writes use service role (RLS deny-all for anon/auth).

create table if not exists public.atlas_deliverable_files (
  id uuid primary key,
  user_id text not null,
  file_name text not null,
  format text not null,
  mime_type text not null,
  is_placeholder boolean not null default false,
  source_content text not null,
  base_file_name text not null,
  size_bytes integer,
  content_base64 text,
  generated_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists atlas_deliverable_files_user_expires_idx
  on public.atlas_deliverable_files (user_id, expires_at desc);

create index if not exists atlas_deliverable_files_expires_idx
  on public.atlas_deliverable_files (expires_at);

alter table public.atlas_deliverable_files enable row level security;

drop policy if exists "atlas_deliverable_files_deny_anon"
  on public.atlas_deliverable_files;
create policy "atlas_deliverable_files_deny_anon"
  on public.atlas_deliverable_files
  for all to anon, authenticated
  using (false) with check (false);
