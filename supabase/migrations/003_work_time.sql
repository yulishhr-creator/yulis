-- Work time tracking (one open session per user)
create table public.work_time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now()
);

create index work_time_entries_user_id_idx on public.work_time_entries (user_id);
create index work_time_entries_position_id_idx on public.work_time_entries (position_id);
create index work_time_entries_user_started_idx on public.work_time_entries (user_id, started_at desc);

create unique index work_time_entries_one_open_per_user
  on public.work_time_entries (user_id)
  where ended_at is null;

alter table public.work_time_entries enable row level security;

create policy work_time_entries_own on public.work_time_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
