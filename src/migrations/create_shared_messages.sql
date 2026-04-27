create extension if not exists pgcrypto;

create table if not exists public.shared_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.shared_message_threads(id) on delete set null,
  thread_key text not null,
  family text not null,
  thread_type text not null,
  entity_type text,
  entity_id text,
  message_type text not null default 'note',
  subject text,
  body text not null,
  sender_user_id uuid not null,
  sender_role text not null,
  recipient_user_id uuid not null,
  recipient_role text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'sent',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.shared_messages
  add column if not exists thread_id uuid references public.shared_message_threads(id) on delete set null;

create index if not exists idx_shared_messages_thread_key
  on public.shared_messages (thread_key, created_at desc);

create index if not exists idx_shared_messages_thread_id
  on public.shared_messages (thread_id, created_at desc);

create index if not exists idx_shared_messages_recipient
  on public.shared_messages (recipient_user_id, read_at, created_at desc);

create index if not exists idx_shared_messages_sender
  on public.shared_messages (sender_user_id, created_at desc);

create index if not exists idx_shared_messages_family
  on public.shared_messages (family, thread_type, created_at desc);

alter table public.shared_messages enable row level security;

drop policy if exists "Users can read their shared messages" on public.shared_messages;
create policy "Users can read their shared messages"
on public.shared_messages
for select
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists "Users can create shared messages they send" on public.shared_messages;
create policy "Users can create shared messages they send"
on public.shared_messages
for insert
with check (auth.uid() = sender_user_id);

drop policy if exists "Users can update their received shared messages" on public.shared_messages;
create policy "Users can update their received shared messages"
on public.shared_messages
for update
using (auth.uid() = recipient_user_id)
with check (auth.uid() = recipient_user_id);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shared_messages to service_role;

notify pgrst, 'reload schema';
