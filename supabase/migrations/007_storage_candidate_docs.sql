insert into storage.buckets (id, name, public)
values ('candidate-docs', 'candidate-docs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Candidate docs public read" on storage.objects;
drop policy if exists "Users upload candidate docs in their folder" on storage.objects;
drop policy if exists "Users update own candidate docs" on storage.objects;
drop policy if exists "Users delete own candidate docs" on storage.objects;

create policy "Candidate docs public read"
on storage.objects for select to public using (bucket_id = 'candidate-docs');

create policy "Users upload candidate docs in their folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'candidate-docs'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);

create policy "Users update own candidate docs"
on storage.objects for update to authenticated
using (bucket_id = 'candidate-docs' and coalesce((storage.foldername(name))[1], '') = auth.uid()::text)
with check (bucket_id = 'candidate-docs' and coalesce((storage.foldername(name))[1], '') = auth.uid()::text);

create policy "Users delete own candidate docs"
on storage.objects for delete to authenticated
using (bucket_id = 'candidate-docs' and coalesce((storage.foldername(name))[1], '') = auth.uid()::text);
