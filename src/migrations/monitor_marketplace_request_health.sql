-- =========================================================
-- STEP 8 — MARKETPLACE REQUEST HEALTH MONITORING
-- Operational checks to run after:
-- - backfill_marketplace_request_threads.sql
-- - audit_marketplace_request_integrity.sql
-- =========================================================

-- ---------------------------------------------------------
-- 1. Marketplace request integrity snapshot
-- Single-row health summary for dashboards / manual checks
-- ---------------------------------------------------------
with request_health as (
  select
    count(*) as total_requests,
    count(*) filter (where coalesce(trim(r.request_reference), '') = '') as missing_reference_count,
    count(*) filter (where coalesce(trim(r.thread_key), '') = '') as missing_thread_key_count,
    count(*) filter (
      where not exists (
        select 1
        from public.shared_message_threads t
        where t.thread_key = r.thread_key
      )
    ) as unresolved_thread_state_count,
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
    ) as missing_shared_submission_count,
    count(*) filter (
      where not exists (
        select 1
        from public.app_booking_messages m
        where m.booking_request_id = r.id
          and lower(coalesce(m.message_kind, '')) = 'submission_event'
      )
    ) as missing_legacy_submission_count,
    count(*) filter (
      where r.owner_id is not null
        and not exists (
          select 1
          from auth.users u
          where u.id = r.owner_id
        )
    ) as missing_owner_auth_count,
    count(*) filter (
      where r.customer_id is not null
        and not exists (
          select 1
          from auth.users u
          where u.id = r.customer_id
        )
    ) as missing_customer_auth_count
  from public.app_booking_requests r
)
select
  *,
  case
    when missing_reference_count = 0
     and missing_thread_key_count = 0
     and unresolved_thread_state_count = 0
     and missing_shared_submission_count = 0
     and missing_owner_auth_count = 0
    then 'healthy'
    else 'needs_attention'
  end as health_status
from request_health;

-- ---------------------------------------------------------
-- 2. Recent failures / anomalies
-- Use this as the first drill-down after the summary above
-- ---------------------------------------------------------
select
  r.id,
  r.request_reference,
  r.request_status,
  r.owner_id,
  r.customer_id,
  r.customer_email,
  r.thread_key,
  r.thread_id,
  r.created_at,
  r.updated_at,
  case when coalesce(trim(r.request_reference), '') = '' then true else false end as missing_reference,
  case when coalesce(trim(r.thread_key), '') = '' then true else false end as missing_thread_key,
  case
    when not exists (
      select 1
      from public.shared_message_threads t
      where t.thread_key = r.thread_key
    ) then true
    else false
  end as missing_thread_state,
  case
    when not exists (
      select 1
      from public.shared_messages m
      where m.family = 'marketplace'
        and (
          m.thread_key = r.thread_key
          or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
          or (m.metadata ->> 'requestId') = r.id::text
        )
    ) then true
    else false
  end as missing_shared_submission
from public.app_booking_requests r
where
  coalesce(trim(r.request_reference), '') = ''
  or coalesce(trim(r.thread_key), '') = ''
  or not exists (
    select 1
    from public.shared_message_threads t
    where t.thread_key = r.thread_key
  )
  or not exists (
    select 1
    from public.shared_messages m
    where m.family = 'marketplace'
      and (
        m.thread_key = r.thread_key
        or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
        or (m.metadata ->> 'requestId') = r.id::text
      )
  )
order by r.created_at desc
limit 100;

-- ---------------------------------------------------------
-- 3. Owner case verification — salam@gmail.com
-- Run this after backfill to verify the original incident
-- ---------------------------------------------------------
select
  owner_user.email as owner_email,
  r.id,
  r.request_reference,
  r.request_status,
  r.customer_name,
  r.customer_email,
  r.thread_key,
  r.thread_id,
  exists (
    select 1
    from public.shared_message_threads t
    where t.thread_key = r.thread_key
  ) as has_thread_state,
  exists (
    select 1
    from public.shared_messages m
    where m.family = 'marketplace'
      and (
        m.thread_key = r.thread_key
        or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
        or (m.metadata ->> 'requestId') = r.id::text
      )
  ) as has_shared_message,
  exists (
    select 1
    from public.app_booking_messages m
    where m.booking_request_id = r.id
      and lower(coalesce(m.message_kind, '')) = 'submission_event'
  ) as has_legacy_submission,
  r.created_at
from public.app_booking_requests r
join auth.users owner_user
  on owner_user.id = r.owner_id
where lower(coalesce(owner_user.email, '')) = 'salam@gmail.com'
order by r.created_at desc;

-- ---------------------------------------------------------
-- 4. Owner inbox seed coverage
-- Requests that should now surface in owner inbox
-- ---------------------------------------------------------
select
  owner_user.email as owner_email,
  count(*) as request_count,
  count(*) filter (
    where coalesce(trim(r.thread_key), '') <> ''
      and exists (
        select 1
        from public.shared_message_threads t
        where t.thread_key = r.thread_key
      )
  ) as request_count_with_thread_state,
  count(*) filter (
    where exists (
      select 1
      from public.shared_messages m
      where m.family = 'marketplace'
        and (
          m.thread_key = r.thread_key
          or (m.entity_type = 'marketplace_request' and m.entity_id = r.id::text)
          or (m.metadata ->> 'requestId') = r.id::text
        )
    )
  ) as request_count_with_shared_messages
from public.app_booking_requests r
join auth.users owner_user
  on owner_user.id = r.owner_id
group by owner_user.email
order by request_count desc, owner_user.email
limit 50;

-- ---------------------------------------------------------
-- 5. Manual runbook
-- 1. Run query 1. Health should be 'healthy' or clearly improving.
-- 2. If not healthy, run query 2 and inspect the newest anomalies first.
-- 3. Run query 3 to validate the original salam@gmail.com incident.
-- 4. Run query 4 to confirm owner inbox seed coverage is rising.
-- 5. Re-run after each backfill or booking-handler deploy.
-- ---------------------------------------------------------
