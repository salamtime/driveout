-- =========================================================
-- Normalize rental threads
-- Step 7 of the messaging audit plan
--
-- Goals:
-- - create one canonical rental thread per rental context where the system
--   can safely infer endpoints from existing shared thread/message data
-- - normalize existing bookings/rental thread state onto context_type=rental
-- - backfill rental lifecycle into thread_events from rental_events
-- - keep shared_messages unchanged
--
-- Important:
-- This migration is intentionally conservative. It does not invent sender /
-- recipient endpoints for rentals that only exist in rental_events with no
-- supporting shared thread or shared message history.
-- =========================================================

create extension if not exists pgcrypto;

create or replace function public.build_rental_thread_key(p_rental_id text)
returns text
language sql
immutable
as $$
  select 'rental:' || coalesce(nullif(trim(p_rental_id), ''), 'unknown');
$$;

drop table if exists pg_temp.rental_contexts;
create temporary table rental_contexts on commit drop as
with rental_ids as (
  select distinct re.rental_id::text as rental_id
  from public.rental_events re
  where re.rental_id is not null

  union

  select distinct coalesce(nullif(trim(t.context_id), ''), nullif(trim(t.entity_id), '')) as rental_id
  from public.shared_message_threads t
  where
    t.context_type = 'rental'
    or t.entity_type = 'rental'
    or t.family = 'bookings'
    or t.thread_type = 'rental_booking'

  union

  select distinct coalesce(nullif(trim(m.entity_id), ''), nullif(trim(m.metadata ->> 'rentalId'), '')) as rental_id
  from public.shared_messages m
  where
    m.entity_type = 'rental'
    or m.family = 'bookings'
    or m.thread_type = 'rental_booking'
)
select
  rid.rental_id,
  public.build_rental_thread_key(rid.rental_id) as canonical_thread_key,
  endpoint.sender_user_id,
  endpoint.recipient_user_id,
  endpoint.created_at as source_created_at
from rental_ids rid
left join lateral (
  select
    t.sender_user_id,
    t.recipient_user_id,
    t.created_at
  from public.shared_message_threads t
  where
    (
      (t.context_type = 'rental' and t.context_id = rid.rental_id)
      or (t.entity_type = 'rental' and t.entity_id = rid.rental_id)
      or (t.family = 'bookings' and t.entity_id = rid.rental_id)
      or t.thread_key = public.build_rental_thread_key(rid.rental_id)
    )
    and t.sender_user_id is not null
    and t.recipient_user_id is not null
  order by t.updated_at desc nulls last, t.created_at desc nulls last
  limit 1
) endpoint on true
where coalesce(trim(rid.rental_id), '') <> '';

-- ---------------------------------------------------------
-- 1. Normalize existing rental-like thread state
-- ---------------------------------------------------------
update public.shared_message_threads t
set
  family = 'bookings',
  thread_type = 'rental_booking',
  entity_type = 'rental',
  entity_id = rc.rental_id,
  context_type = 'rental',
  context_id = rc.rental_id,
  workflow_status = case
    when coalesce(t.workflow_status, 'active') = 'merged' then 'merged'
    else coalesce(t.workflow_status, 'active')
  end,
  visibility_scope = case
    when coalesce(t.visibility_scope, '') = '' then 'public'
    else t.visibility_scope
  end,
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'rentalId', rc.rental_id,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_rental_threads'
  ),
  updated_at = now()
from rental_contexts rc
where
  (t.context_type = 'rental' and t.context_id = rc.rental_id)
  or (t.entity_type = 'rental' and t.entity_id = rc.rental_id)
  or (t.family = 'bookings' and coalesce(t.entity_id, '') = rc.rental_id)
  or t.thread_key = rc.canonical_thread_key;

-- ---------------------------------------------------------
-- 2. Create canonical rental thread state only when endpoints are known
-- ---------------------------------------------------------
insert into public.shared_message_threads (
  id,
  thread_key,
  family,
  thread_type,
  entity_type,
  entity_id,
  sender_user_id,
  recipient_user_id,
  priority,
  waiting_on,
  context_type,
  context_id,
  workflow_status,
  visibility_scope,
  last_message_at,
  created_at,
  updated_at,
  metadata
)
select
  gen_random_uuid(),
  rc.canonical_thread_key,
  'bookings',
  'rental_booking',
  'rental',
  rc.rental_id,
  rc.sender_user_id,
  rc.recipient_user_id,
  'normal',
  null,
  'rental',
  rc.rental_id,
  'active',
  'public',
  null,
  coalesce(rc.source_created_at, now()),
  now(),
  jsonb_build_object(
    'rentalId', rc.rental_id,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_rental_threads'
  )
from rental_contexts rc
where rc.sender_user_id is not null
  and rc.recipient_user_id is not null
  and not exists (
    select 1
    from public.shared_message_threads t
    where (t.context_type = 'rental' and t.context_id = rc.rental_id and coalesce(t.workflow_status, 'active') <> 'merged')
       or t.thread_key = rc.canonical_thread_key
  );

drop table if exists pg_temp.rental_thread_canonical;
create temporary table rental_thread_canonical on commit drop as
with ranked as (
  select
    rc.rental_id,
    rc.canonical_thread_key,
    t.id as thread_id,
    t.thread_key,
    row_number() over (
      partition by rc.rental_id
      order by
        case when t.thread_key = rc.canonical_thread_key then 0 else 1 end,
        t.updated_at desc nulls last,
        t.created_at desc nulls last,
        t.id
    ) as rn
  from rental_contexts rc
  join public.shared_message_threads t
    on (
      (t.context_type = 'rental' and t.context_id = rc.rental_id)
      or (t.entity_type = 'rental' and t.entity_id = rc.rental_id)
      or t.thread_key = rc.canonical_thread_key
    )
)
select
  rental_id,
  canonical_thread_key,
  thread_id,
  thread_key
from ranked
where rn = 1;

-- ---------------------------------------------------------
-- 3. Mark duplicate rental threads as merged
-- ---------------------------------------------------------
drop table if exists pg_temp.rental_duplicate_threads;
create temporary table rental_duplicate_threads on commit drop as
with ranked as (
  select
    rtc.rental_id,
    rtc.thread_id as canonical_thread_id,
    rtc.thread_key as canonical_thread_key,
    t.id as thread_id,
    t.thread_key,
    row_number() over (
      partition by rtc.rental_id, t.id
      order by t.updated_at desc nulls last, t.created_at desc nulls last, t.id
    ) as rn
  from rental_thread_canonical rtc
  join public.shared_message_threads t
    on (
      (t.context_type = 'rental' and t.context_id = rtc.rental_id)
      or (t.entity_type = 'rental' and t.entity_id = rtc.rental_id)
      or t.thread_key = rtc.canonical_thread_key
    )
)
select
  rental_id,
  thread_id as duplicate_thread_id,
  thread_key as duplicate_thread_key,
  canonical_thread_id,
  canonical_thread_key
from ranked
where rn = 1
  and thread_id <> canonical_thread_id;

update public.shared_message_threads t
set
  merged_into_thread_id = d.canonical_thread_id,
  workflow_status = 'merged',
  archived_at = coalesce(t.archived_at, now()),
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'mergedAt', now(),
    'mergedIntoThreadId', d.canonical_thread_id,
    'mergedIntoThreadKey', d.canonical_thread_key,
    'mergeReason', 'duplicate_rental_thread'
  ),
  updated_at = now()
from rental_duplicate_threads d
where t.id = d.duplicate_thread_id;

update public.shared_messages m
set
  thread_key = d.canonical_thread_key,
  entity_type = case when coalesce(m.entity_type, '') = '' then 'rental' else m.entity_type end,
  entity_id = coalesce(nullif(m.entity_id, ''), d.rental_id),
  metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'rentalId', d.rental_id,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_rental_threads',
    'originalThreadKey', m.thread_key
  )
from rental_duplicate_threads d
where m.thread_key = d.duplicate_thread_key;

-- ---------------------------------------------------------
-- 4. Refresh canonical rental thread state
-- ---------------------------------------------------------
update public.shared_message_threads t
set
  family = 'bookings',
  thread_type = 'rental_booking',
  entity_type = 'rental',
  entity_id = rtc.rental_id,
  context_type = 'rental',
  context_id = rtc.rental_id,
  last_message_at = latest.last_message_at,
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'rentalId', rtc.rental_id,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_rental_threads'
  ),
  updated_at = now()
from rental_thread_canonical rtc
left join (
  select
    m.thread_key,
    max(m.created_at) as last_message_at
  from public.shared_messages m
  group by m.thread_key
) latest on latest.thread_key = rtc.thread_key
where t.id = rtc.thread_id;

-- ---------------------------------------------------------
-- 5. Backfill rental lifecycle into thread_events
-- ---------------------------------------------------------
insert into public.thread_events (
  thread_id,
  context_type,
  context_id,
  event_type,
  title,
  description,
  actor_user_id,
  actor_role,
  payload,
  source_table,
  source_row_id,
  created_at,
  updated_at
)
select
  rtc.thread_id,
  'rental',
  rtc.rental_id,
  case
    when lower(coalesce(re.event_type, '')) in ('started', 'rental_started', 'start', 'pickup', 'picked_up') then 'approval'
    when lower(coalesce(re.event_type, '')) in ('cancelled', 'canceled', 'refunded', 'failed') then 'rejection'
    when lower(coalesce(re.event_type, '')) in ('completed', 'returned', 'rental_completed', 'complete') then 'status_update'
    else 'status_update'
  end,
  case
    when lower(coalesce(re.event_type, '')) in ('request_sent', 'submitted', 'created', 'scheduled') then 'Rental created'
    when lower(coalesce(re.event_type, '')) in ('started', 'rental_started', 'start', 'pickup', 'picked_up') then 'Rental started'
    when lower(coalesce(re.event_type, '')) in ('completed', 'returned', 'rental_completed', 'complete') then 'Rental completed'
    when lower(coalesce(re.event_type, '')) in ('cancelled', 'canceled') then 'Rental cancelled'
    when lower(coalesce(re.event_type, '')) = 'refunded' then 'Rental refunded'
    else initcap(replace(coalesce(re.event_type, 'rental_update'), '_', ' '))
  end,
  nullif(trim(coalesce(re.metadata ->> 'description', re.metadata ->> 'note', re.metadata ->> 'reason', '')), ''),
  null,
  case
    when lower(coalesce(re.actor, '')) = 'renter' then 'customer'
    when lower(coalesce(re.actor, '')) in ('owner') then 'owner'
    when lower(coalesce(re.actor, '')) in ('admin') then 'admin'
    else 'system'
  end,
  coalesce(re.metadata, '{}'::jsonb) || jsonb_build_object(
    'rentalId', rtc.rental_id,
    'legacyActor', re.actor,
    'legacyEventType', re.event_type
  ),
  'rental_events',
  re.id::text,
  coalesce(re.created_at, now()),
  now()
from public.rental_events re
join rental_thread_canonical rtc
  on rtc.rental_id = re.rental_id::text
where not exists (
  select 1
  from public.thread_events e
  where e.thread_id = rtc.thread_id
    and e.source_table = 'rental_events'
    and e.source_row_id = re.id::text
);

create unique index if not exists idx_shared_message_threads_rental_context_unique
  on public.shared_message_threads(context_type, context_id)
  where context_type = 'rental'
    and context_id is not null
    and coalesce(workflow_status, 'active') <> 'merged';

notify pgrst, 'reload schema';
