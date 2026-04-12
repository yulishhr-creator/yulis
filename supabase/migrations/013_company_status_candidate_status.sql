-- Company: active / inactive (in addition to soft-delete via deleted_at)
alter table public.companies add column if not exists status text;

update public.companies set status = 'active' where status is null;

alter table public.companies alter column status set default 'active';
alter table public.companies alter column status set not null;

alter table public.companies drop constraint if exists companies_status_check;
alter table public.companies add constraint companies_status_check check (status in ('active', 'inactive'));

comment on column public.companies.status is 'Client engagement: active (default) or inactive.';

-- Candidate: replace outcome with status (pending / success / cancelled)
-- Maps legacy: active→pending, hired→success, rejected|withdrawn→cancelled; in_progress→pending if present
alter table public.candidates drop constraint if exists candidates_outcome_check;

update public.candidates
set outcome = case outcome
  when 'active' then 'pending'
  when 'hired' then 'success'
  when 'rejected' then 'cancelled'
  when 'withdrawn' then 'cancelled'
  when 'in_progress' then 'pending'
  else 'pending'
end;

alter table public.candidates rename column outcome to status;

alter table public.candidates alter column status set default 'pending';

alter table public.candidates drop constraint if exists candidates_status_check;
alter table public.candidates add constraint candidates_status_check check (status in ('pending', 'success', 'cancelled'));

comment on column public.candidates.status is 'Disposition: pending (in pipeline), success (won), cancelled (closed without success).';

-- Public share payload: expose candidate status under key "status"
create or replace function public.get_candidate_share_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  cand record;
  pos record;
  comp record;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return null;
  end if;

  select * into t
  from candidate_share_tokens
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  select * into cand
  from candidates
  where id = t.candidate_id
    and deleted_at is null;

  if not found then
    return null;
  end if;

  select * into pos
  from positions
  where id = cand.position_id
    and deleted_at is null;

  if not found then
    return null;
  end if;

  select id, name into comp
  from companies
  where id = pos.company_id
    and deleted_at is null;

  return jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', cand.id,
      'full_name', cand.full_name,
      'email', cand.email,
      'current_title', cand.current_title,
      'status', cand.status
    ),
    'position', jsonb_build_object(
      'id', pos.id,
      'title', pos.title,
      'status', pos.status
    ),
    'company', case when comp.id is not null then jsonb_build_object('name', comp.name) else null end
  );
end;
$$;

-- Public position candidate list: status column in JSON
create or replace function public.get_position_public_candidates_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  pos record;
  comp record;
  candidates_json jsonb;
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

  if pos.status not in ('pending', 'in_progress') then
    return null;
  end if;

  select id, name into comp
  from companies
  where id = pos.company_id
    and deleted_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'full_name', sub.full_name,
        'status', sub.candidate_status,
        'current_title', sub.current_title,
        'stage_name', sub.stage_name
      )
      order by sub.sort_key
    ),
    '[]'::jsonb
  )
  into candidates_json
  from (
    select
      c.full_name,
      c.status as candidate_status,
      c.current_title,
      coalesce(ps.name, '') as stage_name,
      lower(trim(c.full_name)) as sort_key
    from candidates c
    left join position_stages ps on ps.id = c.position_stage_id
    where c.position_id = pos.id
      and c.deleted_at is null
  ) sub;

  return jsonb_build_object(
    'position', jsonb_build_object(
      'id', pos.id,
      'title', pos.title,
      'status', pos.status
    ),
    'company', case when comp.id is not null then jsonb_build_object('name', comp.name) else null end,
    'candidates', candidates_json
  );
end;
$$;
