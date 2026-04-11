-- Requirements as free text on the role (client paste). Drop list-backed arrays.

alter table public.positions
  add column if not exists requirements text;

update public.positions
set requirements = nullif(trim(array_to_string(requirement_item_values, E'\n')), '')
where coalesce(cardinality(requirement_item_values), 0) > 0;

alter table public.positions
  drop column if exists requirement_item_values;

alter table public.candidates
  drop column if exists requirement_item_values;

delete from public.list_items where list_key = 'requirements';
