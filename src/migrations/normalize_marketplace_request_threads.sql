-- =========================================================
-- Normalize marketplace request threads
-- Step 5 of the messaging audit plan
--
-- Goals:
-- - enforce one active shared thread per marketplace request
-- - backfill canonical request context onto shared_message_threads
-- - link app_booking_requests to canonical threads
-- - backfill marketplace lifecycle into thread_events
-- - keep legacy shared_messages/app_booking_messages intact
-- =========================================================

create extension if not exists pgcrypto;

create or replace function public.build_marketplace_request_reference(p_request_id uuid)
returns text
language sql
immutable
as $$
  select 'RQ-' || upper(substr(md5(p_request_id::text), 1, 8));
$$;

create or replace function public.build_marketplace_request_thread_key(
  p_request_id uuid,
  p_owner_id uuid,
  p_customer_id uuid
)
returns text
language sql
immutable
as $$
  select concat_ws(
    ':',
    'marketplace',
    'marketplace_customer_request',
    'marketplace_request',
    coalesce(p_request_id::text, 'unknown'),
    coalesce(p_owner_id::text, 'unknown'),
    coalesce(p_customer_id::text, p_owner_id::text, 'unknown')
  );
$$;

alter table public.app_booking_requests
  add column if not exists request_reference text,
  add column if not exists thread_key text,
  add column if not exists thread_id uuid;

create unique index if not exists idx_app_booking_requests_request_reference_unique
  on public.app_booking_requests(request_reference)
  where request_reference is not null;

create index if not exists idx_app_booking_requests_thread_key
  on public.app_booking_requests(thread_key)
  where thread_key is not null;

update public.app_booking_requests r
set
  request_reference = public.build_marketplace_request_reference(r.id),
  updated_at = now()
where coalesce(trim(r.request_reference), '') = '';

update public.app_booking_requests r
set
  thread_key = public.build_marketplace_request_thread_key(r.id, r.owner_id, r.customer_id),
  updated_at = now()
where coalesce(trim(r.thread_key), '') = ''
   or r.thread_key <> public.build_marketplace_request_thread_key(r.id, r.owner_id, r.customer_id);

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
  r.thread_key,
  'marketplace',
  'marketplace_customer_request',
  'marketplace_request',
  r.id::text,
  coalesce(r.customer_id, r.owner_id),
  coalesce(r.owner_id, r.customer_id),
  'normal',
  case
    when lower(coalesce(r.request_status::text, '')) in ('pending', 'negotiated') then 'owner'
    when lower(coalesce(r.request_status::text, '')) in ('accepted', 'pre_approved', 'approved') then 'customer'
    else null
  end,
  'request',
  r.id::text,
  case
    when lower(coalesce(r.request_status::text, '')) in ('declined', 'cancelled', 'expired', 'closed') then 'archived'
    when lower(coalesce(r.request_status::text, '')) in ('approved') then 'resolved'
    else 'active'
  end,
  'public',
  null,
  coalesce(r.created_at, now()),
  greatest(coalesce(r.updated_at, r.created_at, now()), now()),
  jsonb_build_object(
    'requestId', r.id,
    'requestReference', r.request_reference,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_marketplace_request_threads'
  )
from public.app_booking_requests r
where not exists (
  select 1
  from public.shared_message_threads t
  where t.thread_key = r.thread_key
     or (t.context_type = 'request' and t.context_id = r.id::text and coalesce(t.workflow_status, 'active') <> 'merged')
);

update public.shared_message_threads t
set
  family = 'marketplace',
  thread_type = 'marketplace_customer_request',
  entity_type = 'marketplace_request',
  entity_id = r.id::text,
  context_type = 'request',
  context_id = r.id::text,
  sender_user_id = coalesce(t.sender_user_id, r.customer_id, r.owner_id),
  recipient_user_id = coalesce(t.recipient_user_id, r.owner_id, r.customer_id),
  visibility_scope = 'public',
  waiting_on = case
    when lower(coalesce(r.request_status::text, '')) in ('pending', 'negotiated') then 'owner'
    when lower(coalesce(r.request_status::text, '')) in ('accepted', 'pre_approved', 'approved') then 'customer'
    else null
  end,
  workflow_status = case
    when coalesce(t.workflow_status, 'active') = 'merged' then 'merged'
    when lower(coalesce(r.request_status::text, '')) in ('declined', 'cancelled', 'expired', 'closed') then 'archived'
    when lower(coalesce(r.request_status::text, '')) in ('approved') then 'resolved'
    else 'active'
  end,
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'requestId', r.id,
    'requestReference', r.request_reference,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_marketplace_request_threads'
  ),
  updated_at = now()
from public.app_booking_requests r
where
  t.thread_key = r.thread_key
  or (t.entity_type = 'marketplace_request' and t.entity_id = r.id::text)
  or (t.context_type = 'request' and t.context_id = r.id::text);

update public.app_booking_requests r
set
  thread_id = t.id,
  updated_at = now()
from public.shared_message_threads t
where t.thread_key = r.thread_key
  and (
    r.thread_id is null
    or r.thread_id is distinct from t.id
  );

drop table if exists pg_temp.marketplace_request_thread_duplicates;
create temporary table marketplace_request_thread_duplicates on commit drop as
with ranked as (
  select
    r.id as request_id,
    t.id as thread_id,
    t.thread_key,
    row_number() over (
      partition by r.id
      order by
        case when t.id = r.thread_id then 0 else 1 end,
        t.updated_at desc nulls last,
        t.created_at desc nulls last,
        t.id
    ) as rn
  from public.app_booking_requests r
  join public.shared_message_threads t
    on (
      t.thread_key = r.thread_key
      or (t.entity_type = 'marketplace_request' and t.entity_id = r.id::text)
      or (t.context_type = 'request' and t.context_id = r.id::text)
    )
)
select
  winner.request_id,
  loser.thread_id as duplicate_thread_id,
  loser.thread_key as duplicate_thread_key,
  winner.thread_id as canonical_thread_id,
  winner.thread_key as canonical_thread_key
from ranked winner
join ranked loser
  on loser.request_id = winner.request_id
where winner.rn = 1
  and loser.rn > 1;

update public.shared_message_threads t
set
  merged_into_thread_id = d.canonical_thread_id,
  workflow_status = 'merged',
  archived_at = coalesce(t.archived_at, now()),
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'mergedAt', now(),
    'mergedIntoThreadId', d.canonical_thread_id,
    'mergedIntoThreadKey', d.canonical_thread_key,
    'mergeReason', 'duplicate_marketplace_request_thread'
  ),
  updated_at = now()
from marketplace_request_thread_duplicates d
where t.id = d.duplicate_thread_id
  and t.id <> d.canonical_thread_id;

update public.shared_messages m
set
  thread_key = d.canonical_thread_key,
  metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'normalizedAt', now(),
    'normalizedSource', 'normalize_marketplace_request_threads',
    'requestId', d.request_id,
    'originalThreadKey', m.thread_key
  )
from marketplace_request_thread_duplicates d
where m.thread_key = d.duplicate_thread_key;

-- ---------------------------------------------------------
-- Backfill request lifecycle into thread_events
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
  t.id,
  'request',
  r.id::text,
  'submission',
  'Request submitted',
  concat_ws(
    ' • ',
    case when coalesce(trim(r.request_reference), '') <> '' then concat('Reference ', r.request_reference) else null end,
    nullif(trim(r.customer_message), '')
  ),
  coalesce(r.customer_id, r.owner_id),
  case when r.customer_id is null then 'system' else 'customer' end,
  jsonb_strip_nulls(
    jsonb_build_object(
      'requestId', r.id,
      'requestReference', r.request_reference,
      'requestStatus', r.request_status,
      'listingId', r.listing_id,
      'vehicleId', r.vehicle_public_profile_id,
      'ownerId', r.owner_id,
      'customerId', r.customer_id,
      'requestedStartAt', r.requested_start_at,
      'requestedEndAt', r.requested_end_at,
      'rentalType', r.rental_type,
      'duration', r.duration
    )
  ),
  'app_booking_requests',
  r.id::text,
  coalesce(r.created_at, now()),
  now()
from public.app_booking_requests r
join public.shared_message_threads t
  on t.thread_key = r.thread_key
where not exists (
  select 1
  from public.thread_events e
  where e.thread_id = t.id
    and e.source_table = 'app_booking_requests'
    and e.source_row_id = r.id::text
    and e.event_type = 'submission'
);

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
  t.id,
  'request',
  r.id::text,
  case
    when lower(coalesce(r.request_status::text, '')) in ('accepted', 'pre_approved', 'approved') then 'approval'
    when lower(coalesce(r.request_status::text, '')) in ('declined', 'cancelled', 'expired') then 'rejection'
    else 'status_update'
  end,
  case
    when lower(coalesce(r.request_status::text, '')) in ('accepted', 'pre_approved') then 'Request approved'
    when lower(coalesce(r.request_status::text, '')) = 'approved' then 'Booking confirmed'
    when lower(coalesce(r.request_status::text, '')) = 'declined' then 'Request declined'
    when lower(coalesce(r.request_status::text, '')) = 'cancelled' then 'Request cancelled'
    when lower(coalesce(r.request_status::text, '')) = 'expired' then 'Request expired'
    when lower(coalesce(r.request_status::text, '')) = 'negotiated' then 'Request updated'
    when lower(coalesce(r.request_status::text, '')) = 'closed' then 'Request closed'
    else 'Request updated'
  end,
  coalesce(nullif(trim(r.owner_response), ''), concat('Status: ', r.request_status::text)),
  r.owner_id,
  'owner',
  jsonb_strip_nulls(
    jsonb_build_object(
      'requestId', r.id,
      'requestReference', r.request_reference,
      'requestStatus', r.request_status,
      'ownerResponse', r.owner_response,
      'counterOffer', r.counter_offer
    )
  ),
  'app_booking_requests_status',
  r.id::text,
  coalesce(
    r.accepted_at,
    r.declined_at,
    r.negotiated_at,
    r.closed_at,
    r.updated_at,
    now()
  ),
  now()
from public.app_booking_requests r
join public.shared_message_threads t
  on t.thread_key = r.thread_key
where lower(coalesce(r.request_status::text, '')) not in ('pending', '')
  and not exists (
    select 1
    from public.thread_events e
    where e.thread_id = t.id
      and e.source_table = 'app_booking_requests_status'
      and e.source_row_id = r.id::text
      and e.event_type = case
        when lower(coalesce(r.request_status::text, '')) in ('accepted', 'pre_approved', 'approved') then 'approval'
        when lower(coalesce(r.request_status::text, '')) in ('declined', 'cancelled', 'expired') then 'rejection'
        else 'status_update'
      end
  );

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
  t.id,
  'request',
  r.id::text,
  case
    when lower(coalesce(m.message_kind, '')) = 'submission_event' then 'submission'
    else 'message'
  end,
  case
    when lower(coalesce(m.message_kind, '')) = 'submission_event' then 'Request submitted'
    else 'Request message'
  end,
  nullif(trim(m.message_body), ''),
  m.sender_id,
  lower(coalesce(m.sender_type, 'system')),
  jsonb_strip_nulls(
    jsonb_build_object(
      'requestId', r.id,
      'requestReference', r.request_reference,
      'legacyMessageKind', m.message_kind,
      'legacyMetadata', m.metadata
    )
  ),
  'app_booking_messages',
  m.id::text,
  coalesce(m.created_at, now()),
  now()
from public.app_booking_messages m
join public.app_booking_requests r
  on r.id = m.booking_request_id
join public.shared_message_threads t
  on t.thread_key = r.thread_key
where lower(coalesce(m.message_kind, '')) in ('submission_event', 'status_event')
  and not exists (
    select 1
    from public.thread_events e
    where e.thread_id = t.id
      and e.source_table = 'app_booking_messages'
      and e.source_row_id = m.id::text
  );

create unique index if not exists idx_shared_message_threads_request_context_unique
  on public.shared_message_threads(context_type, context_id)
  where context_type = 'request'
    and context_id is not null
    and coalesce(workflow_status, 'active') <> 'merged';

notify pgrst, 'reload schema';
