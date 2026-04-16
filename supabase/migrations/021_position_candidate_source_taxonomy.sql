-- Assignment source: import, sourcing, cv, referral (replaces legacy external / app).

alter table public.position_candidates drop constraint if exists position_candidates_source_check;

update public.position_candidates
set source = 'import'
where source = 'external';

update public.position_candidates
set source = 'sourcing'
where source = 'app';

alter table public.position_candidates alter column source set default 'sourcing';

alter table public.position_candidates
  add constraint position_candidates_source_check
  check (source in ('import', 'sourcing', 'cv', 'referral'));

comment on column public.position_candidates.source is 'How this candidate was attributed for this role: import, sourcing, cv, referral.';
