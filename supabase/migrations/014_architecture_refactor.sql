-- Architecture refactor: independent candidates, position_candidates junction,
-- new position statuses, enriched stages, task_templates, position_candidate_transitions.
-- Fresh operational data start (truncate); companies and auth users preserved.

-- ---------------------------------------------------------------------------
-- 0) Clear operational data
-- ---------------------------------------------------------------------------
truncate table
  public.activity_events,
  public.work_time_entries,
  public.calendar_events,
  public.tasks,
  public.reminders,
  public.candidate_share_tokens,
  public.candidate_import_batches,
  public.position_public_list_tokens,
  public.candidates,
  public.position_stages,
  public.positions
restart identity cascade;

-- ---------------------------------------------------------------------------
-- 1) Tasks: drop candidate_id, add position_candidate_id (FK after junction exists)
-- ---------------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_candidate_id_fkey;
alter table public.tasks drop column if exists candidate_id;

-- ---------------------------------------------------------------------------
-- 2) Candidates: decouple from position; global active/archived
-- ---------------------------------------------------------------------------
alter table public.candidates drop constraint if exists candidates_position_id_fkey;
alter table public.candidates drop constraint if exists candidates_position_stage_id_fkey;

drop index if exists public.candidates_position_id_idx;

alter table public.candidates drop column if exists position_id;
alter table public.candidates drop column if exists position_stage_id;
alter table public.candidates drop column if exists source;

alter table public.candidates drop constraint if exists candidates_status_check;
alter table public.candidates alter column status drop default;
update public.candidates set status = 'active' where status is not null;
alter table public.candidates alter column status set default 'active';
alter table public.candidates add constraint candidates_status_check check (status in ('active', 'archived'));

comment on column public.candidates.status is 'Global pool: active (default) or archived.';

-- ---------------------------------------------------------------------------
-- 3) Positions: new lifecycle statuses + hiring / opened / salary budget
-- ---------------------------------------------------------------------------
alter table public.positions drop constraint if exists positions_status_check;
alter table public.positions alter column status drop default;
-- Table truncated; map any legacy values if re-run without truncate
update public.positions set status = 'active' where status in ('pending', 'in_progress');
update public.positions set status = 'succeeded' where status = 'success';
alter table public.positions add constraint positions_status_check check (status in ('active', 'on_hold', 'cancelled', 'succeeded'));
alter table public.positions alter column status set default 'active';

alter table public.positions add column if not exists opened_at date not null default (current_date);
alter table public.positions add column if not exists salary_budget numeric;
alter table public.positions add column if not exists hiring_manager_name text;
alter table public.positions add column if not exists hiring_manager_email text;
alter table public.positions add column if not exists hiring_manager_phone text;

comment on column public.positions.opened_at is 'Role opened date (user-set).';
comment on column public.positions.salary_budget is 'Client salary budget (single amount).';

-- ---------------------------------------------------------------------------
-- 4) Position stages: optional interview metadata
-- ---------------------------------------------------------------------------
alter table public.position_stages add column if not exists description text;
alter table public.position_stages add column if not exists interviewers text;
alter table public.position_stages add column if not exists duration_minutes int;
alter table public.position_stages add column if not exists is_remote boolean not null default false;

-- ---------------------------------------------------------------------------
-- 5) Junction: candidate on position (pipeline + per-assignment status)
-- ---------------------------------------------------------------------------
create table public.position_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  position_stage_id uuid references public.position_stages (id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'rejected', 'withdrawn')),
  source text not null default 'app' check (source in ('external', 'app')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (position_id, candidate_id)
);

create index position_candidates_user_id_idx on public.position_candidates (user_id);
create index position_candidates_position_id_idx on public.position_candidates (position_id);
create index position_candidates_candidate_id_idx on public.position_candidates (candidate_id);
create index position_candidates_position_status_idx on public.position_candidates (position_id, status);

alter table public.position_candidates enable row level security;

create policy position_candidates_own on public.position_candidates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger position_candidates_updated_at before update on public.position_candidates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6) Structured stage/status transition log (stats + timeline)
-- ---------------------------------------------------------------------------
create table public.position_candidate_transitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_candidate_id uuid not null references public.position_candidates (id) on delete cascade,
  transition_type text not null check (transition_type in ('stage', 'status')),
  from_stage_id uuid references public.position_stages (id) on delete set null,
  to_stage_id uuid references public.position_stages (id) on delete set null,
  from_status text,
  to_status text,
  created_at timestamptz not null default now()
);

create index position_candidate_transitions_pc_created_idx
  on public.position_candidate_transitions (position_candidate_id, created_at desc);

alter table public.position_candidate_transitions enable row level security;

create policy position_candidate_transitions_own on public.position_candidate_transitions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 7) Tasks: optional link to assignment row
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists position_candidate_id uuid references public.position_candidates (id) on delete set null;

create index if not exists tasks_position_candidate_id_idx on public.tasks (position_candidate_id)
  where position_candidate_id is not null;

-- ---------------------------------------------------------------------------
-- 8) Activity events: optional assignment context
-- ---------------------------------------------------------------------------
alter table public.activity_events add column if not exists position_candidate_id uuid references public.position_candidates (id) on delete set null;

create index if not exists activity_events_position_candidate_idx
  on public.activity_events (position_candidate_id, created_at desc)
  where position_candidate_id is not null;

-- ---------------------------------------------------------------------------
-- 9) Task templates (global per user)
-- ---------------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_templates_user_id_idx on public.task_templates (user_id);

alter table public.task_templates enable row level security;

create policy task_templates_own on public.task_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger task_templates_updated_at before update on public.task_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10) Public RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_candidate_share_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  cand record;
  pos public.positions%ROWTYPE;
  pos_found boolean;
  comp_name text;
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

  select p.* into pos
  from position_candidates pc
  join positions p on p.id = pc.position_id and p.deleted_at is null
  where pc.candidate_id = cand.id
  order by pc.created_at desc
  limit 1;
  pos_found := found;

  comp_name := null;
  if pos_found then
    select c.name into comp_name
    from companies c
    where c.id = pos.company_id
      and c.deleted_at is null
    limit 1;
  end if;

  return jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', cand.id,
      'full_name', cand.full_name,
      'email', cand.email,
      'current_title', cand.current_title,
      'status', cand.status
    ),
    'position', case when pos_found then jsonb_build_object(
      'id', pos.id,
      'title', pos.title,
      'status', pos.status
    ) else null end,
    'company', case when comp_name is not null then jsonb_build_object('name', comp_name) else null end
  );
end;
$$;

grant execute on function public.get_candidate_share_payload(text) to anon, authenticated;

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

  if pos.status not in ('active', 'on_hold') then
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
        'status', sub.assignment_status,
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
      pc.status as assignment_status,
      c.current_title,
      coalesce(ps.name, '') as stage_name,
      lower(trim(c.full_name)) as sort_key
    from position_candidates pc
    join candidates c on c.id = pc.candidate_id and c.deleted_at is null
    left join position_stages ps on ps.id = pc.position_stage_id
    where pc.position_id = pos.id
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

grant execute on function public.get_position_public_candidates_list(text) to anon, authenticated;
