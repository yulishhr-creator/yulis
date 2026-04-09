-- Saved LinkedIn search / filter URL for sourcing on this role
alter table public.positions
  add column if not exists linkedin_saved_search_url text;
