-- P3: explicit deny policies for the private deliverable bucket.
-- Service role bypasses RLS. Anon/authenticated must not read objects
-- even if they guess {userId}/{deliverableId}/… paths.
-- Mirrors atlas-image-attachments storage policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atlas-deliverable-files',
  'atlas-deliverable-files',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/markdown',
    'text/plain',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "atlas_deliverable_files_storage_deny_select" on storage.objects;
drop policy if exists "atlas_deliverable_files_storage_deny_insert" on storage.objects;
drop policy if exists "atlas_deliverable_files_storage_deny_update" on storage.objects;
drop policy if exists "atlas_deliverable_files_storage_deny_delete" on storage.objects;

create policy "atlas_deliverable_files_storage_deny_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'atlas-deliverable-files' and false);

create policy "atlas_deliverable_files_storage_deny_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'atlas-deliverable-files' and false);

create policy "atlas_deliverable_files_storage_deny_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'atlas-deliverable-files' and false)
  with check (bucket_id = 'atlas-deliverable-files' and false);

create policy "atlas_deliverable_files_storage_deny_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'atlas-deliverable-files' and false);
