-- Critical stage threshold (default 3 when null in app)
alter table public.positions
  add column if not exists critical_stage_sort_order int;

comment on column public.positions.critical_stage_sort_order is 'Emit milestone when candidate reaches stage with sort_order >= this value; app treats null as 3.';

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  position_id uuid not null references public.positions (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  title text not null,
  subtitle text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index activity_events_position_created_idx on public.activity_events (position_id, created_at desc);
create index activity_events_candidate_created_idx on public.activity_events (candidate_id, created_at desc)
  where candidate_id is not null;

alter table public.activity_events enable row level security;

create policy activity_events_own on public.activity_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
