-- Manual list order on /tasks (per user + status).
alter table public.tasks add column if not exists sort_order integer not null default 0;

create index if not exists tasks_user_status_sort_idx on public.tasks (user_id, status, sort_order);

with ranked as (
  select
    id,
    (row_number() over (partition by user_id, status order by updated_at desc) - 1) * 1000 as so
  from public.tasks
)
update public.tasks t
set sort_order = r.so
from ranked r
where t.id = r.id;
