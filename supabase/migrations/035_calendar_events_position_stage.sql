-- Link scheduled interviews to a pipeline stage (for kanban indicators and rollups).

alter table public.calendar_events
  add column if not exists position_stage_id uuid references public.position_stages (id) on delete set null;

create index if not exists calendar_events_user_candidate_stage_idx
  on public.calendar_events (user_id, candidate_id, position_stage_id)
  where candidate_id is not null and position_stage_id is not null;

comment on column public.calendar_events.position_stage_id is
  'Pipeline stage chosen when scheduling from a role (optional).';
