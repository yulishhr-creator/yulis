-- Per-share contact exposure on public pipeline; rate-limit anonymous viewer messages.

alter table public.position_public_list_tokens
  add column if not exists expose_contact boolean not null default false;

comment on column public.position_public_list_tokens.expose_contact is
  'When true, get_position_public_pipeline_report may include candidate email and linkedin for that share link.';

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
  show_contact boolean;
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

  show_contact := coalesce(t.expose_contact, false);

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
          'status', sub.assignment_status,
          'position_candidate_id', sub.pc_id,
          'email', case when show_contact then sub.email else null end,
          'linkedin', case when show_contact then sub.linkedin else null end
        )
        order by sub.sort_key
      ),
      '[]'::jsonb
    )
    into cand_json
    from (
      select
        c.full_name,
        pc.id as pc_id,
        pc.status as assignment_status,
        nullif(trim(c.email), '') as email,
        nullif(trim(c.linkedin), '') as linkedin,
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
        'status', sub.assignment_status,
        'position_candidate_id', sub.pc_id,
        'email', case when show_contact then sub.email else null end,
        'linkedin', case when show_contact then sub.linkedin else null end
      )
      order by sub.sort_key
    ),
    '[]'::jsonb
  )
  into unassigned_json
  from (
    select
      c.full_name,
      pc.id as pc_id,
      pc.status as assignment_status,
      nullif(trim(c.email), '') as email,
      nullif(trim(c.linkedin), '') as linkedin,
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

create or replace function public.post_position_public_viewer_message(p_token text, p_position_candidate_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  pos record;
  pc record;
  b text;
  cnt int;
begin
  if p_token is null or length(trim(p_token)) < 8 or p_position_candidate_id is null then
    raise exception 'invalid';
  end if;

  b := trim(p_body);
  if length(b) < 1 or length(b) > 4000 then
    raise exception 'invalid body';
  end if;

  select * into t
  from position_public_list_tokens
  where token = p_token
    and revoked_at is null
  limit 1;

  if not found then
    raise exception 'invalid token';
  end if;

  select * into pos
  from positions
  where id = t.position_id
    and deleted_at is null;

  if not found or pos.status not in ('active', 'on_hold') then
    raise exception 'invalid position';
  end if;

  select * into pc
  from position_candidates
  where id = p_position_candidate_id
    and position_id = pos.id
    and archived_at is null;

  if not found then
    raise exception 'invalid assignment';
  end if;

  select count(*)::int into cnt
  from position_public_viewer_messages m
  where m.position_candidate_id = p_position_candidate_id
    and m.created_at > now() - interval '1 hour';

  if cnt >= 20 then
    raise exception 'rate_limit';
  end if;

  select count(*)::int into cnt
  from position_public_viewer_messages m
  join position_candidates pc2 on pc2.id = m.position_candidate_id
  where pc2.position_id = pos.id
    and m.created_at > now() - interval '1 day';

  if cnt >= 250 then
    raise exception 'rate_limit_position';
  end if;

  insert into position_public_viewer_messages (position_candidate_id, body)
  values (p_position_candidate_id, b);
end;
$$;

grant execute on function public.post_position_public_viewer_message(text, uuid, text) to anon, authenticated;
