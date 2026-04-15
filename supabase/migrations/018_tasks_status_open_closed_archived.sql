-- Tasks: replace todo/in_progress/done with open/closed/archived.

-- Drop the old check first so rows can be remapped to open/closed/archived.
alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks set status = 'open'   where status in ('todo', 'in_progress');
update public.tasks set status = 'closed' where status = 'done';

alter table public.tasks add constraint tasks_status_check
  check (status in ('open', 'closed', 'archived'));

alter table public.tasks alter column status set default 'open';
