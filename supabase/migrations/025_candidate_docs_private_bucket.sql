-- Private candidate-docs bucket: resumes/attachments only readable by owner (authenticated + folder match).

update storage.buckets
set public = false
where id = 'candidate-docs';

drop policy if exists "Candidate docs public read" on storage.objects;

create policy "Users read own candidate docs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'candidate-docs'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);
