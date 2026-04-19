-- Recruiter dashboard: list viewer messages left on public pipeline links for a position.

create or replace function public.list_position_public_viewer_messages_for_owner(p_position_id uuid)
returns table (
  id uuid,
  position_candidate_id uuid,
  candidate_id uuid,
  candidate_full_name text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from positions p
    where p.id = p_position_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.id,
    m.position_candidate_id,
    c.id,
    coalesce(nullif(trim(c.full_name), ''), 'Candidate')::text,
    m.body,
    m.created_at
  from position_public_viewer_messages m
  join position_candidates pc on pc.id = m.position_candidate_id
  join candidates c on c.id = pc.candidate_id and c.deleted_at is null
  where pc.position_id = p_position_id
    and pc.user_id = auth.uid()
  order by m.created_at desc;
end;
$$;

comment on function public.list_position_public_viewer_messages_for_owner(uuid) is
  'Owner: all public-link viewer comments for assignments on this role.';

revoke all on function public.list_position_public_viewer_messages_for_owner(uuid) from public;
grant execute on function public.list_position_public_viewer_messages_for_owner(uuid) to authenticated;
