-- Client salary budget as free text (ranges, notes) as well as plain amounts.
alter table public.positions
  alter column salary_budget type text
  using (case when salary_budget is null then null else trim(salary_budget::text) end);

comment on column public.positions.salary_budget is 'Client salary budget: plain amount, range, or notes (free text).';
