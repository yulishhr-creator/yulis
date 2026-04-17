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
