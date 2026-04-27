-- =========================================================
-- Create thread_events
-- Step 4 of the messaging audit plan
--
-- Goals:
-- - introduce a dedicated event timeline table
-- - keep shared_messages unchanged as the human chat store
-- - support progressive backfill from marketplace, verification, and rental systems
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.thread_events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.shared_message_threads(id) on delete cascade,
  context_type text not null,
  context_id text not null,
  event_type text not null,
  title text not null,
  description text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  payload jsonb not null default '{}'::jsonb,
  source_table text,
  source_row_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'thread_events_event_type_check'
  ) then
    alter table public.thread_events
      add constraint thread_events_event_type_check
      check (event_type in (
        'submission',
        'status_update',
        'approval',
        'rejection',
        'message',
        'system_note'
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'thread_events_actor_role_check'
  ) then
    alter table public.thread_events
      add constraint thread_events_actor_role_check
      check (
        actor_role is null
        or actor_role in ('customer', 'owner', 'admin', 'support', 'staff', 'system')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'thread_events_source_unique'
  ) then
    alter table public.thread_events
      add constraint thread_events_source_unique
      unique nulls not distinct (thread_id, source_table, source_row_id, event_type);
  end if;
end $$;

create or replace function public.app_set_thread_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_thread_events_updated_at on public.thread_events;
create trigger trg_thread_events_updated_at
before update on public.thread_events
for each row
execute function public.app_set_thread_events_updated_at();

create index if not exists idx_thread_events_thread_created_at
  on public.thread_events(thread_id, created_at desc);

create index if not exists idx_thread_events_context_created_at
  on public.thread_events(context_type, context_id, created_at desc);

create index if not exists idx_thread_events_event_type_created_at
  on public.thread_events(event_type, created_at desc);

create index if not exists idx_thread_events_actor_created_at
  on public.thread_events(actor_user_id, created_at desc)
  where actor_user_id is not null;

alter table public.thread_events enable row level security;

drop policy if exists "Users can read thread events through participation" on public.thread_events;
create policy "Users can read thread events through participation"
on public.thread_events
for select
using (
  exists (
    select 1
    from public.shared_message_participants p
    where p.thread_id = thread_events.thread_id
      and p.user_id = auth.uid()
  )
);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.thread_events to service_role;

notify pgrst, 'reload schema';
