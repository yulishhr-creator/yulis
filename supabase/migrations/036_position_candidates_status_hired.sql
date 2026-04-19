-- Allow "hired" as a terminal assignment status on position_candidates.
alter table public.position_candidates drop constraint if exists position_candidates_status_check;

alter table public.position_candidates
  add constraint position_candidates_status_check
  check (status in ('in_progress', 'rejected', 'withdrawn', 'hired'));
