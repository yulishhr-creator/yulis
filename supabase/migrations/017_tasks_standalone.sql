-- Standalone tasks: position optional; direct candidate when no role.

alter table public.tasks alter column position_id drop not null;

alter table public.tasks add column if not exists candidate_id uuid references public.candidates (id) on delete set null;

create index if not exists tasks_candidate_id_idx on public.tasks (candidate_id) where candidate_id is not null;

alter table public.tasks drop constraint if exists tasks_pc_requires_position;

alter table public.tasks add constraint tasks_pc_requires_position check (
  position_candidate_id is null or position_id is not null
);

comment on column public.tasks.candidate_id is 'Optional pool candidate when task has no position.';
comment on column public.tasks.position_id is 'Optional role; null for standalone tasks.';
