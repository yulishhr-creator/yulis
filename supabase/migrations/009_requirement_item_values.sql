-- Replace free-text positions.requirements with list-backed arrays (list_key = 'requirements' in list_items).

alter table public.positions
  add column if not exists requirement_item_values text[] not null default '{}';

alter table public.candidates
  add column if not exists requirement_item_values text[] not null default '{}';

-- Migrate legacy prose into tokens (split on newlines, commas, semicolons, pipes)
update public.positions p
set requirement_item_values = coalesce(sub.arr, '{}')
from (
  select
    id,
    array(
      select trim(both t)
      from unnest(regexp_split_to_array(requirements, e'[\n,;|]+')) as t
      where trim(both t) <> ''
    ) as arr
  from public.positions
  where requirements is not null and trim(requirements) <> ''
) sub
where p.id = sub.id;

alter table public.positions drop column if exists requirements;
