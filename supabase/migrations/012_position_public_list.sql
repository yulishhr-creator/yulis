-- Public read-only list of candidates on a position via opaque token (SECURITY DEFINER).
-- Only positions with status pending or in_progress return data; closed roles invalidate the view.

create table public.position_public_list_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  token text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index position_public_list_tokens_token_idx on public.position_public_list_tokens (token) where revoked_at is null;

create unique index position_public_list_one_active_per_position
  on public.position_public_list_tokens (position_id)
  where revoked_at is null;

alter table public.position_public_list_tokens enable row level security;

create policy position_public_list_tokens_own on public.position_public_list_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
        'outcome', sub.outcome,
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
      c.outcome,
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

grant execute on function public.get_position_public_candidates_list(text) to anon, authenticated;
