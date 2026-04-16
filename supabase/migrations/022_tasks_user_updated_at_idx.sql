-- Speed up tasks list for a user ordered by updated_at (Overview /tasks page).
create index if not exists tasks_user_updated_at_idx on public.tasks (user_id, updated_at desc);
