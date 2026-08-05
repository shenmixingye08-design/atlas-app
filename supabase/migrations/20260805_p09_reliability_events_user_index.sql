-- P09: index reliability events by user for diagnostics without seq-scan.
-- Safe additive migration (IF NOT EXISTS).

create index if not exists atlas_reliability_events_user_created_idx
  on public.atlas_reliability_events (user_id, created_at desc)
  where user_id is not null;
