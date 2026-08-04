-- Image attachments metadata + private Storage bucket (MINERVOT Vision).
-- Apply in Supabase SQL editor when SUPABASE_SERVICE_ROLE_KEY is configured.
-- Server writes use service role (RLS deny-all for anon/auth).
-- Storage objects are never public; OpenAI receives Base64 downloaded via service role.

-- ---------------------------------------------------------------------------
-- Metadata table
-- ---------------------------------------------------------------------------
create table if not exists public.atlas_image_attachments (
  id text primary key,
  user_id text not null,
  job_id text not null default 'pending',
  original_file_name text not null,
  mime_type text not null,
  original_mime_type text,
  original_bytes integer not null,
  processed_bytes integer not null,
  width integer not null default 0,
  height integer not null default 0,
  content_hash text not null,
  original_storage_path text not null,
  processed_storage_path text not null,
  -- temporary: eligible for TTL purge via expires_at
  -- retained: kept for profile / deliverable references (never TTL-purged)
  retention_policy text not null default 'temporary'
    check (retention_policy in ('temporary', 'retained')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atlas_image_attachments_user_hash_idx
  on public.atlas_image_attachments (user_id, content_hash);

create index if not exists atlas_image_attachments_user_job_idx
  on public.atlas_image_attachments (user_id, job_id);

create index if not exists atlas_image_attachments_ttl_idx
  on public.atlas_image_attachments (expires_at)
  where retention_policy = 'temporary' and expires_at is not null;

alter table public.atlas_image_attachments enable row level security;

drop policy if exists "atlas_image_attachments_deny_anon" on public.atlas_image_attachments;

create policy "atlas_image_attachments_deny_anon"
  on public.atlas_image_attachments
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Private Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atlas-image-attachments',
  'atlas-image-attachments',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Explicit deny policies for this bucket only (service role bypasses RLS).
-- Do not grant access to other buckets from these policies.
drop policy if exists "atlas_image_attachments_storage_deny_select" on storage.objects;
drop policy if exists "atlas_image_attachments_storage_deny_insert" on storage.objects;
drop policy if exists "atlas_image_attachments_storage_deny_update" on storage.objects;
drop policy if exists "atlas_image_attachments_storage_deny_delete" on storage.objects;

create policy "atlas_image_attachments_storage_deny_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'atlas-image-attachments' and false);

create policy "atlas_image_attachments_storage_deny_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'atlas-image-attachments' and false);

create policy "atlas_image_attachments_storage_deny_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'atlas-image-attachments' and false)
  with check (bucket_id = 'atlas-image-attachments' and false);

create policy "atlas_image_attachments_storage_deny_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'atlas-image-attachments' and false);