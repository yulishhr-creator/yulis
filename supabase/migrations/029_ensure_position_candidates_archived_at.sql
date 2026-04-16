-- Idempotent safety net: production DBs that never ran 023 (or equivalent) lack
-- position_candidates.archived_at, which breaks PostgREST embeds (e.g. Positions board).
alter table public.position_candidates add column if not exists archived_at timestamptz;

comment on column public.position_candidates.archived_at is 'When set, assignment is hidden from this role.';
