-- Phase 3: automation wizard drafts (additive — uses atlas_user_state domain key automation_draft)
-- No new secrets/tokens stored in drafts.

comment on table atlas_user_state is 'Durable per-user overflow; automation_draft domain holds wizard progress without OAuth tokens';
