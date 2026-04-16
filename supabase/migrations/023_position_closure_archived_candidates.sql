-- Optional closure date for reporting; soft-archive assignments per role; remove unused LinkedIn URL.

alter table public.positions add column if not exists closure_date date;

comment on column public.positions.closure_date is 'When the role ended (succeeded/cancelled); optional for backfilled stats.';

alter table public.position_candidates add column if not exists archived_at timestamptz;

comment on column public.position_candidates.archived_at is 'When set, assignment is hidden from this role.';

alter table public.positions drop column if exists linkedin_saved_search_url;

-- Public pipeline: exclude archived assignments from counts and stage lists.
create or replace function public.get_position_public_pipeline_report(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  pos record;
  comp record;
  stages_json jsonb := '[]'::jsonb;
  stage_rec record;
  cand_json jsonb;
  unassigned_json jsonb;
  total int;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return null;
  end if;

  select * into t
  from position_public_list_tokens
  where token = p_token
    and revoked_at is null
  limit 1;

  if not found then
    return null;
  end if;

  select * into pos
  from positions
  where id = t.position_id
    and deleted_at is null;

  if not found then
    return null;
  end if;

  if pos.status not in ('active', 'on_hold') then
    return null;
  end if;

  select id, name into comp
  from companies
  where id = pos.company_id
    and deleted_at is null;

  select count(*)::int into total
  from position_candidates pc
  join candidates c on c.id = pc.candidate_id and c.deleted_at is null
  where pc.position_id = pos.id
    and pc.archived_at is null;

  for stage_rec in
    select id, name, sort_order
    from position_stages
    where position_id = pos.id
    order by sort_order desc
  loop
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'full_name', sub.full_name,
          'status', sub.assignment_status
        )
        order by sub.sort_key
      ),
      '[]'::jsonb
    )
    into cand_json
    from (
      select
        c.full_name,
        pc.status as assignment_status,
        lower(trim(c.full_name)) as sort_key
      from position_candidates pc
      join candidates c on c.id = pc.candidate_id and c.deleted_at is null
      where pc.position_id = pos.id
        and pc.position_stage_id = stage_rec.id
        and pc.archived_at is null
    ) sub;

    if jsonb_array_length(cand_json) > 0 then
      stages_json := stages_json || jsonb_build_array(
        jsonb_build_object(
          'name', stage_rec.name,
          'sort_order', stage_rec.sort_order,
          'candidates', cand_json
        )
      );
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'full_name', sub.full_name,
        'status', sub.assignment_status
      )
      order by sub.sort_key
    ),
    '[]'::jsonb
  )
  into unassigned_json
  from (
    select
      c.full_name,
      pc.status as assignment_status,
      lower(trim(c.full_name)) as sort_key
    from position_candidates pc
    join candidates c on c.id = pc.candidate_id and c.deleted_at is null
    where pc.position_id = pos.id
      and pc.position_stage_id is null
      and pc.archived_at is null
  ) sub;

  if jsonb_array_length(unassigned_json) > 0 then
    stages_json := stages_json || jsonb_build_array(
      jsonb_build_object(
        'name', 'Unassigned',
        'sort_order', null,
        'candidates', unassigned_json
      )
    );
  end if;

  return jsonb_build_object(
    'position', jsonb_build_object(
      'id', pos.id,
      'title', pos.title,
      'status', pos.status,
      'opened_at', pos.opened_at
    ),
    'company', case when comp.id is not null then jsonb_build_object('name', comp.name) else null end,
    'total_candidates', total,
    'stages', stages_json
  );
end;
$$;

grant execute on function public.get_position_public_pipeline_report(text) to anon, authenticated;
