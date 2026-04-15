-- Optional client logo / profile image (public URL, e.g. from storage)
alter table public.companies add column if not exists avatar_url text;

comment on column public.companies.avatar_url is 'Public URL for client avatar or logo (set from Positions client board or company settings).';
