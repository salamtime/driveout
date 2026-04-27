-- =========================================================
-- STEP 6 — AUDIT MARKETPLACE REQUEST INTEGRITY
-- Run after:
-- - request creation fixes
-- - backfill_marketplace_request_threads.sql
-- =========================================================

-- ---------------------------------------------------------
-- 1. Requests missing request references
-- Expectation: 0 rows
-- ---------------------------------------------------------
select
  r.id,
  r.owner_id,
  r.customer_id,
  r.customer_email,
  r.request_status,
  r.created_at
from public.app_booking_requests r
where coalesce(trim(r.request_reference), '') = ''
order by r.created_at desc;

-- ---------------------------------------------------------
-- 2. Requests missing canonical thread key
-- Expectation: 0 rows
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.owner_id,
  r.customer_id,
  r.customer_email,
  r.request_status,
  r.created_at
from public.app_booking_requests r
where coalesce(trim(r.thread_key), '') = ''
order by r.created_at desc;

-- ---------------------------------------------------------
-- 3. Requests with thread key that does not resolve to thread state
-- Expectation: 0 rows
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.thread_key,
  r.owner_id,
  r.customer_id,
  r.created_at
from public.app_booking_requests r
left join public.shared_message_threads t
  on t.thread_key = r.thread_key
where coalesce(trim(r.thread_key), '') <> ''
  and t.thread_key is null
order by r.created_at desc;

-- ---------------------------------------------------------
-- 4. Requests missing opening shared submission event
-- Expectation: 0 rows
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.thread_key,
  r.owner_id,
  r.customer_id,
  r.customer_email,
  r.created_at
from public.app_booking_requests r
where not exists (
  select 1
  from public.shared_messages m
  where m.family = 'marketplace'
    and (
      m.thread_key = r.thread_key
      or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
      or (m.metadata ->> 'requestId') = r.id::text
    )
)
order by r.created_at desc;

-- ---------------------------------------------------------
-- 5. Requests missing legacy submission event
-- Expectation: ideally 0 rows after backfill
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.owner_id,
  r.customer_id,
  r.customer_email,
  r.created_at
from public.app_booking_requests r
where not exists (
  select 1
  from public.app_booking_messages m
  where m.booking_request_id = r.id
    and lower(coalesce(m.message_kind, '')) = 'submission_event'
)
order by r.created_at desc;

-- ---------------------------------------------------------
-- 6. Requests whose owner auth user is missing
-- Expectation: 0 rows
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.owner_id,
  r.customer_email,
  r.created_at
from public.app_booking_requests r
left join auth.users owner_user
  on owner_user.id = r.owner_id
where r.owner_id is not null
  and owner_user.id is null
order by r.created_at desc;

-- ---------------------------------------------------------
-- 7. Requests whose customer auth user is missing
-- Informational: guest requests may have null customer_id
-- Expectation: rows here should only be guest/null cases or known legacy exceptions
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.customer_id,
  r.customer_email,
  r.created_at
from public.app_booking_requests r
left join auth.users customer_user
  on customer_user.id = r.customer_id
where r.customer_id is not null
  and customer_user.id is null
order by r.created_at desc;

-- ---------------------------------------------------------
-- 8. Optional participant checks
-- Run these only if public.shared_message_participants exists
-- ---------------------------------------------------------
-- select
--   r.id,
--   r.request_reference,
--   r.thread_key,
--   r.owner_id,
--   r.created_at
-- from public.app_booking_requests r
-- where not exists (
--   select 1
--   from public.shared_message_threads t
--   join public.shared_message_participants p
--     on p.thread_id = t.id
--   where t.thread_key = r.thread_key
--     and p.user_id = r.owner_id
--     and p.participant_role = 'owner'
-- )
-- order by r.created_at desc;
--
-- select
--   r.id,
--   r.request_reference,
--   r.thread_key,
--   r.customer_id,
--   r.customer_email,
--   r.created_at
-- from public.app_booking_requests r
-- where r.customer_id is not null
--   and not exists (
--     select 1
--     from public.shared_message_threads t
--     join public.shared_message_participants p
--       on p.thread_id = t.id
--     where t.thread_key = r.thread_key
--       and p.user_id = r.customer_id
--       and p.participant_role = 'customer'
--   )
-- order by r.created_at desc;

-- ---------------------------------------------------------
-- 9. Requests owned by salam@gmail.com
-- Useful spot-check for this incident
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.request_status,
  r.customer_name,
  r.customer_email,
  r.thread_key,
  r.thread_id,
  r.created_at,
  r.updated_at
from public.app_booking_requests r
join auth.users owner_user
  on owner_user.id = r.owner_id
where lower(coalesce(owner_user.email, '')) = 'salam@gmail.com'
order by r.created_at desc;

-- ---------------------------------------------------------
-- 10. Shared-message counts per request
-- Useful to verify timeline density after repair
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.request_status,
  count(m.id) as shared_message_count,
  min(m.created_at) as first_shared_message_at,
  max(m.created_at) as last_shared_message_at
from public.app_booking_requests r
left join public.shared_messages m
  on m.family = 'marketplace'
 and (
   m.thread_key = r.thread_key
   or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
   or (m.metadata ->> 'requestId') = r.id::text
 )
group by r.id, r.request_reference, r.request_status
order by r.created_at desc;

-- ---------------------------------------------------------
-- 11. Summary counts
-- High-level health snapshot
-- ---------------------------------------------------------
select
  count(*) as total_requests,
  count(*) filter (where coalesce(trim(request_reference), '') = '') as missing_reference_count,
  count(*) filter (where coalesce(trim(thread_key), '') = '') as missing_thread_key_count,
  count(*) filter (
    where not exists (
      select 1
      from public.shared_messages m
      where m.family = 'marketplace'
        and (
          m.thread_key = r.thread_key
          or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
          or (m.metadata ->> 'requestId') = r.id::text
        )
    )
  ) as missing_shared_message_count,
  count(*) filter (
    where not exists (
      select 1
      from public.app_booking_messages m
      where m.booking_request_id = r.id
        and lower(coalesce(m.message_kind, '')) = 'submission_event'
    )
  ) as missing_legacy_message_count
from public.app_booking_requests r;
