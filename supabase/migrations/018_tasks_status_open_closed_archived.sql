-- Tasks: replace todo/in_progress/done with open/closed/archived.

-- 1) Remap existing status values
update public.tasks set status = 'open'   where status in ('todo', 'in_progress');
update public.tasks set status = 'closed' where status = 'done';

-- 2) Replace CHECK constraint + default
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('open', 'closed', 'archived'));

alter table public.tasks alter column status set default 'open';
