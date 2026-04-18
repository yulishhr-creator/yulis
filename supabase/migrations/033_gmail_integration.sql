-- Gmail OAuth: extend token columns and tighten RLS so only the service role can insert/update tokens.

alter table public.user_oauth_integrations
  add column if not exists access_token text,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists scope text,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.user_oauth_integrations.refresh_token_encrypted is
  'Google OAuth refresh token; stored server-side only (column name is legacy).';

drop trigger if exists user_oauth_integrations_updated_at on public.user_oauth_integrations;
create trigger user_oauth_integrations_updated_at
  before update on public.user_oauth_integrations
  for each row execute function public.set_updated_at();

drop policy if exists user_oauth_integrations_own on public.user_oauth_integrations;

create policy user_oauth_read_own
  on public.user_oauth_integrations for select
  using (auth.uid() = user_id);

create policy user_oauth_delete_own
  on public.user_oauth_integrations for delete
  using (auth.uid() = user_id);

-- Token columns must never be readable from the browser (anon key / JWT).
revoke select on public.user_oauth_integrations from authenticated;
grant select (id, user_id, provider, provider_account_email, created_at, revoked_at, updated_at)
  on public.user_oauth_integrations to authenticated;

revoke delete on public.user_oauth_integrations from authenticated;
drop policy if exists user_oauth_delete_own on public.user_oauth_integrations;
