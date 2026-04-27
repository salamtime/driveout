create extension if not exists pgcrypto;

create table if not exists public.shared_message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.shared_messages(id) on delete cascade,
  thread_key text not null,
  family text not null,
  sender_user_id uuid not null,
  recipient_user_id uuid not null,
  bucket text not null default 'chat-media',
  storage_path text,
  public_url text,
  thumbnail_url text,
  mime_type text not null,
  original_filename text,
  file_size bigint,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  expires_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_shared_message_media_thread_key
  on public.shared_message_media (thread_key, created_at desc);

create index if not exists idx_shared_message_media_expiry
  on public.shared_message_media (status, expires_at);

create index if not exists idx_shared_message_media_message_id
  on public.shared_message_media (message_id);

alter table public.shared_message_media enable row level security;

drop policy if exists "Users can read their shared message media" on public.shared_message_media;
create policy "Users can read their shared message media"
on public.shared_message_media
for select
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists "Users can create shared message media they send" on public.shared_message_media;
create policy "Users can create shared message media they send"
on public.shared_message_media
for insert
with check (auth.uid() = sender_user_id);

drop policy if exists "Users can update their shared message media" on public.shared_message_media;
create policy "Users can update their shared message media"
on public.shared_message_media
for update
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id)
with check (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shared_message_media to service_role;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can view chat media" on storage.objects;
create policy "Authenticated users can view chat media"
on storage.objects
for select
to authenticated
using (bucket_id = 'chat-media');

drop policy if exists "Authenticated users can upload chat media" on storage.objects;
create policy "Authenticated users can upload chat media"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-media');

drop policy if exists "Authenticated users can update chat media" on storage.objects;
create policy "Authenticated users can update chat media"
on storage.objects
for update
to authenticated
using (bucket_id = 'chat-media')
with check (bucket_id = 'chat-media');

drop policy if exists "Authenticated users can delete chat media" on storage.objects;
create policy "Authenticated users can delete chat media"
on storage.objects
for delete
to authenticated
using (bucket_id = 'chat-media');

notify pgrst, 'reload schema';
