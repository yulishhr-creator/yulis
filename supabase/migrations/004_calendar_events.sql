create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  subtitle text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index calendar_events_user_starts_idx on public.calendar_events (user_id, starts_at);

alter table public.calendar_events enable row level security;

create policy calendar_events_own on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
