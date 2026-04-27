-- =========================================================
-- Create shared_message_participants
-- Step 3 of the messaging audit plan
--
-- Goals:
-- - introduce a first-class participant model for shared threads
-- - keep sender/recipient compatibility intact
-- - backfill participants from thread endpoints first
-- - enrich marketplace/request threads from request ownership
-- =========================================================

create extension if not exists pgcrypto;

create or replace function public.infer_shared_thread_participant_role(
  p_family text,
  p_context_type text,
  p_thread_type text,
  p_user_id uuid,
  p_sender_user_id uuid,
  p_recipient_user_id uuid
)
returns text
language plpgsql
immutable
as $$
declare
  v_family text := lower(coalesce(p_family, ''));
  v_context_type text := lower(coalesce(p_context_type, ''));
  v_thread_type text := lower(coalesce(p_thread_type, ''));
begin
  if p_user_id is null then
    return 'system';
  end if;

  if v_family = 'marketplace' or v_context_type = 'request' or v_thread_type in ('marketplace_customer_request', 'marketplace_owner_request') then
    if p_sender_user_id is not null and p_user_id = p_sender_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'customer';
    end if;
    if p_recipient_user_id is not null and p_user_id = p_recipient_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'owner';
    end if;
    return 'customer';
  end if;

  if v_family = 'verification' or v_context_type = 'verification' or v_thread_type in ('verification', 'verification_document', 'verification_status') then
    if p_sender_user_id is not null and p_recipient_user_id is not null and p_sender_user_id = p_recipient_user_id then
      return 'customer';
    end if;
    if p_sender_user_id is not null and p_user_id = p_sender_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'customer';
    end if;
    if p_recipient_user_id is not null and p_user_id = p_recipient_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'admin';
    end if;
    return 'customer';
  end if;

  if v_family in ('support', 'account_trust') or v_context_type = 'support' or v_thread_type = 'support_case' then
    if p_sender_user_id is not null and p_user_id = p_sender_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'customer';
    end if;
    if p_recipient_user_id is not null and p_user_id = p_recipient_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'support';
    end if;
    return 'support';
  end if;

  if v_family = 'bookings' or v_context_type = 'rental' or v_thread_type = 'rental_booking' then
    if p_sender_user_id is not null and p_user_id = p_sender_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'customer';
    end if;
    if p_recipient_user_id is not null and p_user_id = p_recipient_user_id and p_sender_user_id is distinct from p_recipient_user_id then
      return 'owner';
    end if;
    return 'customer';
  end if;

  return 'customer';
end;
$$;

create table if not exists public.shared_message_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.shared_message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null,
  visibility_scope text not null default 'public',
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_participants_thread_user_unique'
  ) then
    alter table public.shared_message_participants
      add constraint shared_message_participants_thread_user_unique
      unique (thread_id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_participants_role_check'
  ) then
    alter table public.shared_message_participants
      add constraint shared_message_participants_role_check
      check (participant_role in ('customer', 'owner', 'admin', 'support', 'staff', 'system'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_participants_visibility_scope_check'
  ) then
    alter table public.shared_message_participants
      add constraint shared_message_participants_visibility_scope_check
      check (visibility_scope in ('public', 'internal', 'mixed'));
  end if;
end $$;

create or replace function public.app_set_shared_message_participants_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shared_message_participants_updated_at on public.shared_message_participants;
create trigger trg_shared_message_participants_updated_at
before update on public.shared_message_participants
for each row
execute function public.app_set_shared_message_participants_updated_at();

-- ---------------------------------------------------------
-- 1. Backfill sender endpoint as participant
-- ---------------------------------------------------------
insert into public.shared_message_participants (
  thread_id,
  user_id,
  participant_role,
  visibility_scope,
  is_primary,
  metadata,
  created_at,
  updated_at
)
select
  t.id,
  t.sender_user_id,
  public.infer_shared_thread_participant_role(
    t.family,
    t.context_type,
    t.thread_type,
    t.sender_user_id,
    t.sender_user_id,
    t.recipient_user_id
  ),
  'public',
  true,
  jsonb_build_object(
    'backfilledAt', now(),
    'backfillSource', 'create_shared_message_participants',
    'sourceField', 'sender_user_id'
  ),
  coalesce(t.created_at, now()),
  now()
from public.shared_message_threads t
where t.sender_user_id is not null
on conflict (thread_id, user_id) do update
set
  participant_role = excluded.participant_role,
  visibility_scope = excluded.visibility_scope,
  is_primary = public.shared_message_participants.is_primary or excluded.is_primary,
  metadata = coalesce(public.shared_message_participants.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- ---------------------------------------------------------
-- 2. Backfill recipient endpoint as participant
-- ---------------------------------------------------------
insert into public.shared_message_participants (
  thread_id,
  user_id,
  participant_role,
  visibility_scope,
  is_primary,
  metadata,
  created_at,
  updated_at
)
select
  t.id,
  t.recipient_user_id,
  public.infer_shared_thread_participant_role(
    t.family,
    t.context_type,
    t.thread_type,
    t.recipient_user_id,
    t.sender_user_id,
    t.recipient_user_id
  ),
  'public',
  true,
  jsonb_build_object(
    'backfilledAt', now(),
    'backfillSource', 'create_shared_message_participants',
    'sourceField', 'recipient_user_id'
  ),
  coalesce(t.created_at, now()),
  now()
from public.shared_message_threads t
where t.recipient_user_id is not null
on conflict (thread_id, user_id) do update
set
  participant_role = excluded.participant_role,
  visibility_scope = excluded.visibility_scope,
  is_primary = public.shared_message_participants.is_primary or excluded.is_primary,
  metadata = coalesce(public.shared_message_participants.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- ---------------------------------------------------------
-- 3. Enrich marketplace request threads from request ownership
-- ---------------------------------------------------------
insert into public.shared_message_participants (
  thread_id,
  user_id,
  participant_role,
  visibility_scope,
  is_primary,
  metadata,
  created_at,
  updated_at
)
select
  t.id,
  p.user_id,
  p.participant_role,
  'public',
  true,
  jsonb_build_object(
    'backfilledAt', now(),
    'backfillSource', 'create_shared_message_participants',
    'contextType', 'request',
    'contextId', r.id,
    'requestReference', r.request_reference
  ),
  coalesce(t.created_at, now()),
  now()
from public.app_booking_requests r
join public.shared_message_threads t
  on (
    (t.context_type = 'request' and t.context_id = r.id::text)
    or t.thread_key = r.thread_key
    or (r.thread_id is not null and t.id = r.thread_id)
  )
join lateral (
  select r.owner_id as user_id, 'owner'::text as participant_role
  union all
  select r.customer_id as user_id, 'customer'::text as participant_role
) p on p.user_id is not null
on conflict (thread_id, user_id) do update
set
  participant_role = excluded.participant_role,
  visibility_scope = excluded.visibility_scope,
  is_primary = public.shared_message_participants.is_primary or excluded.is_primary,
  metadata = coalesce(public.shared_message_participants.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- ---------------------------------------------------------
-- 4. Helpful indexes
-- ---------------------------------------------------------
create index if not exists idx_shared_message_participants_thread_id
  on public.shared_message_participants(thread_id);

create index if not exists idx_shared_message_participants_user_id
  on public.shared_message_participants(user_id);

create index if not exists idx_shared_message_participants_thread_role
  on public.shared_message_participants(thread_id, participant_role);

create index if not exists idx_shared_message_participants_user_role
  on public.shared_message_participants(user_id, participant_role);

alter table public.shared_message_participants enable row level security;

drop policy if exists "Users can read their shared message participants" on public.shared_message_participants;
create policy "Users can read their shared message participants"
on public.shared_message_participants
for select
using (auth.uid() = user_id);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shared_message_participants to service_role;

notify pgrst, 'reload schema';
