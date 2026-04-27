-- =========================================================
-- Backfill broken marketplace request linkage
-- - fills missing request_reference
-- - creates canonical shared message thread state
-- - links thread_key/thread_id back to requests when possible
-- - inserts missing submission_event rows
-- - syncs participants when the newer participant table exists
-- =========================================================

create extension if not exists pgcrypto;

create or replace function public.build_marketplace_backfill_request_reference(p_request_id uuid)
returns text
language sql
immutable
as $$
  select 'RQ-' || upper(substr(md5(p_request_id::text), 1, 8));
$$;

create or replace function public.build_marketplace_backfill_thread_key(
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

create unique index if not exists app_booking_requests_reference_key
  on public.app_booking_requests(request_reference)
  where request_reference is not null;

create index if not exists idx_app_booking_requests_thread_key
  on public.app_booking_requests(thread_key)
  where thread_key is not null;

update public.app_booking_requests r
set
  request_reference = public.build_marketplace_backfill_request_reference(r.id),
  updated_at = now()
where coalesce(trim(r.request_reference), '') = '';

insert into public.shared_message_threads (
  thread_key,
  family,
  thread_type,
  entity_type,
  entity_id,
  sender_user_id,
  recipient_user_id,
  priority,
  waiting_on,
  created_at,
  updated_at
)
select
  public.build_marketplace_backfill_thread_key(r.id, r.owner_id, r.customer_id),
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
  coalesce(r.created_at, now()),
  greatest(coalesce(r.updated_at, r.created_at, now()), now())
from public.app_booking_requests r
where not exists (
  select 1
  from public.shared_message_threads t
  where t.thread_key = public.build_marketplace_backfill_thread_key(r.id, r.owner_id, r.customer_id)
);

update public.app_booking_requests r
set
  thread_key = public.build_marketplace_backfill_thread_key(r.id, r.owner_id, r.customer_id),
  updated_at = now()
where r.thread_key is null
   or r.thread_key <> public.build_marketplace_backfill_thread_key(r.id, r.owner_id, r.customer_id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shared_message_threads'
      and column_name = 'id'
  ) then
    execute $sql$
      update public.app_booking_requests r
      set
        thread_id = t.id,
        updated_at = now()
      from public.shared_message_threads t
      where t.thread_key = r.thread_key
        and (r.thread_id is null or r.thread_id <> t.id)
    $sql$;
  end if;
end $$;

insert into public.shared_messages (
  thread_key,
  family,
  thread_type,
  entity_type,
  entity_id,
  message_type,
  subject,
  body,
  sender_user_id,
  sender_role,
  recipient_user_id,
  recipient_role,
  metadata,
  status,
  created_at
)
select
  r.thread_key,
  'marketplace',
  'marketplace_customer_request',
  'marketplace_request',
  r.id::text,
  'submission_event',
  coalesce(nullif(trim(l.title), ''), 'Marketplace request'),
  'Request submitted',
  coalesce(r.customer_id, r.owner_id),
  case
    when r.customer_id is null then 'system'
    else 'customer'
  end,
  coalesce(r.owner_id, r.customer_id),
  'owner',
  jsonb_strip_nulls(
    jsonb_build_object(
      'type', 'marketplace_request',
      'event', 'request_submitted',
      'requestId', r.id,
      'requestReference', r.request_reference,
      'requestStatus', r.request_status,
      'status', r.request_status,
      'replyEnabled', false,
      'listingId', r.listing_id,
      'listingTitle', l.title,
      'vehicleName', l.title,
      'requestedStartAt', r.requested_start_at,
      'requestedEndAt', r.requested_end_at,
      'rentalType', r.rental_type,
      'duration', r.duration,
      'customerName', r.customer_name,
      'customerEmail', r.customer_email,
      'customerPhone', r.customer_phone,
      'customerNote', r.customer_message,
      'backfilled', true,
      'backfillSource', 'backfill_marketplace_request_threads'
    )
  ),
  'sent',
  coalesce(r.created_at, now())
from public.app_booking_requests r
left join public.app_marketplace_listings l
  on l.id = r.listing_id
where not exists (
  select 1
  from public.shared_messages m
  where m.family = 'marketplace'
    and (
      m.thread_key = r.thread_key
      or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
      or (m.metadata ->> 'requestId') = r.id::text
    )
);

insert into public.app_booking_messages (
  booking_request_id,
  sender_id,
  sender_type,
  message_body,
  message_kind,
  metadata,
  created_at
)
select
  r.id,
  r.customer_id,
  case
    when r.customer_id is null then 'system'
    else 'customer'
  end,
  coalesce(nullif(trim(r.customer_message), ''), 'Request submitted'),
  'submission_event',
  jsonb_strip_nulls(
    jsonb_build_object(
      'requestReference', r.request_reference,
      'backfilled', true,
      'backfillSource', 'backfill_marketplace_request_threads'
    )
  ),
  coalesce(r.created_at, now())
from public.app_booking_requests r
where not exists (
  select 1
  from public.app_booking_messages m
  where m.booking_request_id = r.id
    and lower(coalesce(m.message_kind, '')) = 'submission_event'
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'shared_message_participants'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shared_message_threads'
      and column_name = 'id'
  ) then
    execute $sql$
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
        participant.user_id,
        participant.participant_role,
        'public',
        participant.is_primary,
        jsonb_build_object(
          'contextType', 'marketplace_request',
          'contextId', r.id,
          'requestReference', r.request_reference,
          'backfilled', true,
          'backfillSource', 'backfill_marketplace_request_threads'
        ),
        now(),
        now()
      from public.app_booking_requests r
      join public.shared_message_threads t
        on t.thread_key = r.thread_key
      join lateral (
        select r.owner_id as user_id, 'owner'::text as participant_role, true as is_primary
        union all
        select r.customer_id as user_id, 'customer'::text as participant_role, true as is_primary
      ) participant on participant.user_id is not null
      where not exists (
        select 1
        from public.shared_message_participants existing
        where existing.thread_id = t.id
          and existing.user_id = participant.user_id
      )
    $sql$;
  end if;
end $$;

notify pgrst, 'reload schema';
