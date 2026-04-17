-- Idempotent: hosted DBs that never received 026 hit PostgREST "schema cache" errors on expose_contact.
alter table public.position_public_list_tokens
  add column if not exists expose_contact boolean not null default false;
