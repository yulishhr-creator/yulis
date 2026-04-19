-- Run in Supabase SQL Editor (Dashboard → SQL).
-- Brings DB in sync with repo migrations 023–032, 034–035 (skip 033 if you already applied Gmail migration).


-- ========== supabase/migrations/023_position_closure_archived_candidates.sql ==========
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

-- ========== supabase/migrations/024_public_assignment_thread_and_enriched_pipeline.sql ==========
-- Public shared pipeline: richer candidate payload, assignment thread (team notes + viewer messages).

create table if not exists public.position_public_viewer_messages (
  id uuid primary key default gen_random_uuid(),
  position_candidate_id uuid not null references public.position_candidates (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint position_public_viewer_messages_body_len check (char_length(trim(body)) >= 1 and char_length(body) <= 4000)
);

create index if not exists position_public_viewer_messages_pc_idx
  on public.position_public_viewer_messages (position_candidate_id, created_at);

alter table public.position_public_viewer_messages enable row level security;

-- No direct client access; SECURITY DEFINER RPCs only.
drop policy if exists position_public_viewer_messages_deny on public.position_public_viewer_messages;
create policy position_public_viewer_messages_deny on public.position_public_viewer_messages
  for all using (false) with check (false);

comment on table public.position_public_viewer_messages is 'Anonymous lines on public share links; written only via post_position_public_viewer_message.';

-- Enriched pipeline report (contact fields + assignment id for thread).
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
          'status', sub.assignment_status,
          'position_candidate_id', sub.pc_id,
          'email', sub.email,
          'linkedin', sub.linkedin
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
        'email', sub.email,
        'linkedin', sub.linkedin
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

-- Thread: recruiter notes (activity_events) + optional viewer lines.
create or replace function public.get_position_public_assignment_thread(p_token text, p_position_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  pos record;
  pc record;
  out jsonb := '[]'::jsonb;
begin
  if p_token is null or length(trim(p_token)) < 8 or p_position_candidate_id is null then
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

  if not found or pos.status not in ('active', 'on_hold') then
    return null;
  end if;

  select * into pc
  from position_candidates
  where id = p_position_candidate_id
    and position_id = pos.id
    and archived_at is null;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'role', q.role,
        'at', q.at,
        'body', q.body
      )
      order by q.at
    ),
    '[]'::jsonb
  )
  into out
  from (
    select
      'team'::text as role,
      ae.created_at as at,
      coalesce(nullif(trim(ae.subtitle), ''), nullif(trim(ae.title), ''), '') as body
    from activity_events ae
    where ae.event_type = 'note_added'
      and ae.position_candidate_id = p_position_candidate_id
      and ae.position_id = pos.id
    union all
    select
      'viewer'::text,
      m.created_at,
      m.body
    from position_public_viewer_messages m
    where m.position_candidate_id = p_position_candidate_id
  ) q
  where length(trim(q.body)) > 0;

  return coalesce(out, '[]'::jsonb);
end;
$$;

grant execute on function public.get_position_public_assignment_thread(text, uuid) to anon, authenticated;

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

  insert into position_public_viewer_messages (position_candidate_id, body)
  values (p_position_candidate_id, b);
end;
$$;

grant execute on function public.post_position_public_viewer_message(text, uuid, text) to anon, authenticated;

-- ========== supabase/migrations/025_candidate_docs_private_bucket.sql ==========
-- Private candidate-docs bucket: resumes/attachments only readable by owner (authenticated + folder match).

update storage.buckets
set public = false
where id = 'candidate-docs';

drop policy if exists "Candidate docs public read" on storage.objects;

create policy "Users read own candidate docs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'candidate-docs'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);

-- ========== supabase/migrations/026_public_share_expose_contact_and_viewer_limits.sql ==========
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

-- ========== supabase/migrations/027_swap_position_stages.sql ==========
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

-- ========== supabase/migrations/028_drop_legacy_public_candidates_list.sql ==========
-- Legacy RPC superseded by get_position_public_pipeline_report; reduce anon surface.

drop function if exists public.get_position_public_candidates_list(text);

-- ========== supabase/migrations/029_ensure_position_candidates_archived_at.sql ==========
-- Idempotent safety net: production DBs that never ran 023 (or equivalent) lack
-- position_candidates.archived_at, which breaks PostgREST embeds (e.g. Positions board).
alter table public.position_candidates add column if not exists archived_at timestamptz;

comment on column public.position_candidates.archived_at is 'When set, assignment is hidden from this role.';

-- ========== supabase/migrations/030_ensure_expose_contact_column.sql ==========
-- Idempotent: hosted DBs that never received 026 hit PostgREST "schema cache" errors on expose_contact.
alter table public.position_public_list_tokens
  add column if not exists expose_contact boolean not null default false;

-- ========== supabase/migrations/031_ensure_position_public_share_token_rpc.sql ==========
-- Server-side ensure for public pipeline links: bypasses RLS edge cases, verifies position ownership,
-- handles unique (one active token per position) races. Requires expose_contact (see 030 / 026).

alter table public.position_public_list_tokens
  add column if not exists expose_contact boolean not null default false;

create or replace function public.ensure_position_public_share_token(
  p_position_id uuid,
  p_expose_contact boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pos_owner uuid;
  tok text;
  existing_expose boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select p.user_id into pos_owner
  from public.positions p
  where p.id = p_position_id and p.deleted_at is null;

  if pos_owner is null then
    raise exception 'position not found';
  end if;

  if pos_owner <> uid then
    raise exception 'forbidden';
  end if;

  select t.token, coalesce(t.expose_contact, false)
 into tok, existing_expose
  from public.position_public_list_tokens t
  where t.position_id = p_position_id
    and t.revoked_at is null
    and t.user_id = uid
  limit 1;

  if tok is not null then
    if existing_expose is distinct from p_expose_contact then
      update public.position_public_list_tokens
      set expose_contact = p_expose_contact
      where position_id = p_position_id
        and user_id = uid
        and revoked_at is null;
    end if;
    return tok;
  end if;

  tok :=
    replace(gen_random_uuid()::text, '-', '')
    || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 16);

  begin
    insert into public.position_public_list_tokens (user_id, position_id, token, expose_contact)
    values (uid, p_position_id, tok, p_expose_contact);
  exception
    when unique_violation then
      select t.token, coalesce(t.expose_contact, false)
      into tok, existing_expose
      from public.position_public_list_tokens t
      where t.position_id = p_position_id
        and t.revoked_at is null
        and t.user_id = uid
      limit 1;

      if tok is null then
        raise;
      end if;

      if existing_expose is distinct from p_expose_contact then
        update public.position_public_list_tokens
        set expose_contact = p_expose_contact
        where position_id = p_position_id
          and user_id = uid
          and revoked_at is null;
      end if;
  end;

  return tok;
end;
$$;

comment on function public.ensure_position_public_share_token(uuid, boolean) is
  'Authenticated owner: return active public pipeline token or insert one; updates expose_contact in place.';

revoke all on function public.ensure_position_public_share_token(uuid, boolean) from public;
grant execute on function public.ensure_position_public_share_token(uuid, boolean) to authenticated;

-- ========== supabase/migrations/032_public_pipeline_report_position_candidate_ids.sql ==========
-- Restore position_candidate_id (and contact gating) on public pipeline JSON so viewer threads work.
-- Older DBs may still run 023-era function without assignment ids.

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

-- ========== supabase/migrations/034_list_position_public_viewer_messages_for_owner.sql ==========
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

-- ========== supabase/migrations/035_calendar_events_position_stage.sql ==========
-- Link scheduled interviews to a pipeline stage (for kanban indicators and rollups).

alter table public.calendar_events
  add column if not exists position_stage_id uuid references public.position_stages (id) on delete set null;

create index if not exists calendar_events_user_candidate_stage_idx
  on public.calendar_events (user_id, candidate_id, position_stage_id)
  where candidate_id is not null and position_stage_id is not null;

comment on column public.calendar_events.position_stage_id is
  'Pipeline stage chosen when scheduling from a role (optional).';
