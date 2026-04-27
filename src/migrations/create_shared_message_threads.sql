create table if not exists public.shared_message_threads (
  id uuid default gen_random_uuid(),
  thread_key text primary key,
  family text not null,
  thread_type text not null,
  entity_type text,
  entity_id text,
  sender_user_id uuid not null,
  recipient_user_id uuid not null,
  priority text not null default 'normal',
  waiting_on text,
  context_type text,
  context_id text,
  workflow_status text not null default 'active',
  visibility_scope text not null default 'public',
  merged_into_thread_id uuid,
  last_message_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shared_message_threads
  add column if not exists family text,
  add column if not exists thread_type text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists sender_user_id uuid,
  add column if not exists recipient_user_id uuid,
  add column if not exists priority text not null default 'normal',
  add column if not exists waiting_on text,
  add column if not exists context_type text,
  add column if not exists context_id text,
  add column if not exists workflow_status text not null default 'active',
  add column if not exists visibility_scope text not null default 'public',
  add column if not exists merged_into_thread_id uuid,
  add column if not exists last_message_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists resolved_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.shared_message_threads
set id = gen_random_uuid()
where id is null;

alter table public.shared_message_threads
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_threads_id_unique'
  ) then
    alter table public.shared_message_threads
      add constraint shared_message_threads_id_unique unique (id);
  end if;
end $$;

update public.shared_message_threads
set priority = 'normal'
where priority is null;

update public.shared_message_threads
set updated_at = now()
where updated_at is null;

alter table public.shared_messages
  add column if not exists is_internal boolean not null default false;

create index if not exists idx_shared_message_threads_updated_at
  on public.shared_message_threads (updated_at desc);

create index if not exists idx_shared_message_threads_priority
  on public.shared_message_threads (priority, updated_at desc);

alter table public.shared_message_threads enable row level security;

drop policy if exists "Users can read their shared message threads" on public.shared_message_threads;
create policy "Users can read their shared message threads"
on public.shared_message_threads
for select
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists "Users can create their shared message threads" on public.shared_message_threads;
create policy "Users can create their shared message threads"
on public.shared_message_threads
for insert
with check (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists "Users can update their shared message threads" on public.shared_message_threads;
create policy "Users can update their shared message threads"
on public.shared_message_threads
for update
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id)
with check (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shared_message_threads to service_role;

notify pgrst, 'reload schema';
