-- Public read of candidate summary via opaque token (SECURITY DEFINER)
create table public.candidate_share_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index candidate_share_tokens_token_idx on public.candidate_share_tokens (token) where revoked_at is null;

alter table public.candidate_share_tokens enable row level security;

create policy candidate_share_tokens_own on public.candidate_share_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
      'outcome', cand.outcome
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

grant execute on function public.get_candidate_share_payload(text) to anon, authenticated;
