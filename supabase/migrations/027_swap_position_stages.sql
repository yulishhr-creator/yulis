-- Atomic swap of two stage sort_order values for one position (authenticated owner only).

create or replace function public.swap_position_stages(
  p_position_id uuid,
  p_stage_id uuid,
  p_other_stage_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sa int;
  sb int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_stage_id = p_other_stage_id then
    return;
  end if;

  select sort_order into sa
  from position_stages
  where id = p_stage_id
    and user_id = auth.uid()
    and position_id = p_position_id
  for update;

  select sort_order into sb
  from position_stages
  where id = p_other_stage_id
    and user_id = auth.uid()
    and position_id = p_position_id
  for update;

  if sa is null or sb is null then
    raise exception 'not found';
  end if;

  update position_stages
  set sort_order = sb
  where id = p_stage_id
    and user_id = auth.uid()
    and position_id = p_position_id;

  update position_stages
  set sort_order = sa
  where id = p_other_stage_id
    and user_id = auth.uid()
    and position_id = p_position_id;
end;
$$;

grant execute on function public.swap_position_stages(uuid, uuid, uuid) to authenticated;
