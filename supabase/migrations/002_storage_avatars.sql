-- Public bucket for user profile avatars (object path: {user_id}/{filename})
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Avatar objects are publicly readable" on storage.objects;
drop policy if exists "Users can upload an avatar in their folder" on storage.objects;
drop policy if exists "Users can update their avatar objects" on storage.objects;
drop policy if exists "Users can delete their avatar objects" on storage.objects;

create policy "Avatar objects are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'avatars');

create policy "Users can upload an avatar in their folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);

create policy "Users can update their avatar objects"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);

create policy "Users can delete their avatar objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and coalesce((storage.foldername(name))[1], '') = auth.uid()::text
);
