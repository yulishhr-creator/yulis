-- Ensure free-text job description column exists (fixes PostgREST schema cache when migration 011 was not applied).
alter table public.positions add column if not exists requirements text;
