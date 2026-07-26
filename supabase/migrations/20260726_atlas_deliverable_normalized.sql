-- Optional normalized document columns for deliverable file rows.
-- Non-destructive: existing rows remain valid with NULL normalized fields.

alter table if exists public.atlas_deliverable_files
  add column if not exists normalized_document jsonb,
  add column if not exists canonical_html text,
  add column if not exists normalization_version text;

comment on column public.atlas_deliverable_files.normalized_document is
  'StructuredDocument JSON (title/sections). Populated by Document Normalizer.';
comment on column public.atlas_deliverable_files.canonical_html is
  'Print-safe Canonical HTML shared by Web/Word/PDF.';
comment on column public.atlas_deliverable_files.normalization_version is
  'STRUCTURED_DOCUMENT_VERSION used for normalized_document.';
