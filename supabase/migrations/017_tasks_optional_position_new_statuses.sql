-- Tasks refactor: position_id becomes nullable; statuses become open/closed/archived.

-- ---------------------------------------------------------------------------
-- 1) Make position_id optional + softer FK
-- ---------------------------------------------------------------------------
alter table public.tasks alter column position_id drop not null;

alter table public.tasks drop constraint if exists tasks_position_id_fkey;
alter table public.tasks
  add constraint tasks_position_id_fkey
  foreign key (position_id) references public.positions (id)
  on delete set null;

drop index if exists public.tasks_position_id_idx;
create index tasks_position_id_idx on public.tasks (position_id) where position_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Remap existing status values
-- ---------------------------------------------------------------------------
update public.tasks set status = 'open'   where status in ('todo', 'in_progress');
update public.tasks set status = 'closed' where status = 'done';

-- ---------------------------------------------------------------------------
-- 3) Replace CHECK constraint + default
-- ---------------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('open', 'closed', 'archived'));

alter table public.tasks alter column status set default 'open';
