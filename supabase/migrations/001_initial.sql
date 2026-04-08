-- Yulis HR — initial schema (run in Supabase SQL editor or supabase db push)
-- RLS: single-user pattern auth.uid() = user_id

create extension if not exists "pgcrypto";

-- Companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  website text,
  contact_person text,
  contact_phone text,
  contact_email text,
  payment_terms text[] default '{}',
  contract_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index companies_user_id_idx on public.companies (user_id);

-- Positions
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  requirements text,
  industry text,
  salary_min numeric,
  salary_max numeric,
  status text not null check (status in ('pending', 'in_progress', 'success', 'cancelled')),
  welcome_1 text,
  welcome_2 text,
  welcome_3 text,
  planned_fee_ils numeric,
  actual_fee_ils numeric,
  attachment_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index positions_user_id_idx on public.positions (user_id);
create index positions_company_id_idx on public.positions (company_id);

-- Recruitment stages per position
create table public.position_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  sort_order int not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (position_id, sort_order)
);

create index position_stages_position_id_idx on public.position_stages (position_id);

-- Candidates
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  position_stage_id uuid references public.position_stages (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  linkedin text,
  location text,
  current_title text,
  years_exp int,
  salary_expectation text,
  resume_storage_path text,
  profile_photo_storage_path text,
  notes text,
  lead_source text,
  source text not null check (source in ('external', 'app')),
  outcome text not null default 'active' check (outcome in ('active', 'rejected', 'withdrawn', 'hired')),
  email_normalized text,
  phone_normalized text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index candidates_position_id_idx on public.candidates (position_id);
create index candidates_user_id_idx on public.candidates (user_id);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  title text not null,
  description text,
  note_in_progress text,
  status text not null check (status in ('todo', 'in_progress', 'done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_position_id_idx on public.tasks (position_id);

-- Reminders (standalone)
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  due_at timestamptz,
  position_id uuid references public.positions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Excel import audit
create table public.candidate_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  filename text not null,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Email templates
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Configurable dropdown lists
create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  list_key text not null,
  value text not null,
  label text not null,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, list_key, value)
);

create index list_items_user_key_idx on public.list_items (user_id, list_key);

-- Gmail OAuth (refresh token storage — encrypt in production / use Vault)
create table public.user_oauth_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'gmail',
  provider_account_email text,
  refresh_token_encrypted text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, provider)
);

-- RLS
alter table public.companies enable row level security;
alter table public.positions enable row level security;
alter table public.position_stages enable row level security;
alter table public.candidates enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.candidate_import_batches enable row level security;
alter table public.email_templates enable row level security;
alter table public.list_items enable row level security;
alter table public.user_oauth_integrations enable row level security;

create policy companies_own on public.companies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy positions_own on public.positions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy position_stages_own on public.position_stages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy candidates_own on public.candidates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_own on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy reminders_own on public.reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy candidate_import_batches_own on public.candidate_import_batches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy email_templates_own on public.email_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy list_items_own on public.list_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_oauth_integrations_own on public.user_oauth_integrations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at triggers (simple)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger positions_updated_at before update on public.positions for each row execute function public.set_updated_at();
create trigger candidates_updated_at before update on public.candidates for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger reminders_updated_at before update on public.reminders for each row execute function public.set_updated_at();
create trigger email_templates_updated_at before update on public.email_templates for each row execute function public.set_updated_at();
