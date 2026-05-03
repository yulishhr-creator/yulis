-- How many successful placements this requisition needs (default 1). Used for UI "seats filled" and hire flows.
alter table public.positions add column if not exists target_openings int;

update public.positions set target_openings = 1 where target_openings is null;

alter table public.positions alter column target_openings set not null;
alter table public.positions alter column target_openings set default 1;

alter table public.positions drop constraint if exists positions_target_openings_check;
alter table public.positions
  add constraint positions_target_openings_check check (target_openings >= 1);

comment on column public.positions.target_openings is 'Number of hires/seats for this role; multiple hired assignments allowed until user closes the position.';
