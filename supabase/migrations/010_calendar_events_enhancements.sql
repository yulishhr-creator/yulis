-- Optional reminder, CRM links, and importance flag for calendar events
alter table public.calendar_events
  add column reminder_at timestamptz,
  add column is_important boolean not null default false,
  add column position_id uuid references public.positions (id) on delete set null,
  add column candidate_id uuid references public.candidates (id) on delete set null,
  add column company_id uuid references public.companies (id) on delete set null;

alter table public.calendar_events add constraint calendar_events_at_most_one_link check (
  (case when position_id is not null then 1 else 0 end)
  + (case when candidate_id is not null then 1 else 0 end)
  + (case when company_id is not null then 1 else 0 end) <= 1
);

create index calendar_events_reminder_at_idx on public.calendar_events (user_id, reminder_at)
  where reminder_at is not null;

create index calendar_events_important_starts_idx on public.calendar_events (user_id, starts_at)
  where is_important = true;
