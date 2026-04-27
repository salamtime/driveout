-- =========================================================
-- Phase 2: Canonical thread normalization
--
-- Goals:
-- - make shared_message_threads the canonical source of truth
-- - backfill real context links onto existing threads and messages
-- - ensure one active thread per real-world context
-- - keep legacy tables intact while removing thread identity inference
--
-- Compatibility note:
-- - some environments already have shared_message_threads.context_id as uuid
-- - others may still have it as text
-- - this migration detects the live column type and assigns accordingly
-- =========================================================

create extension if not exists pgcrypto;

alter table public.shared_message_threads
  add column if not exists context_type text,
  add column if not exists workflow_status text not null default 'active',
  add column if not exists visibility_scope text not null default 'public';

alter table public.shared_message_threads
  add column if not exists context_id text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_threads_context_type_check'
  ) then
    alter table public.shared_message_threads
      drop constraint shared_message_threads_context_type_check;
  end if;
end $$;

do $$
begin
  alter table public.shared_message_threads
    add constraint shared_message_threads_context_type_check
    check (
      context_type is null
      or context_type in (
        'request',
        'verification',
        'rental',
        'support',
        'marketplace_request'
      )
    );
exception
  when duplicate_object then
    null;
end $$;

drop index if exists public.idx_shared_message_threads_context_unique_active;
drop index if exists public.idx_shared_message_threads_context_type_context_id;

alter table public.shared_messages
  add column if not exists thread_id uuid references public.shared_message_threads(id) on delete set null;

-- ---------------------------------------------------------
-- 1. Backfill canonical request thread context from requests
-- ---------------------------------------------------------
do $$
declare
  context_id_data_type text;
  context_assignment text;
begin
  select c.data_type
  into context_id_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'shared_message_threads'
    and c.column_name = 'context_id';

  context_assignment := case
    when context_id_data_type = 'uuid' then 'r.id'
    else 'r.id::text'
  end;

  execute format($sql$
    update public.shared_message_threads t
    set
      context_type = 'request',
      context_id = %s,
      family = coalesce(nullif(t.family, ''), 'marketplace'),
      thread_type = coalesce(nullif(t.thread_type, ''), 'marketplace_customer_request'),
      entity_type = 'marketplace_request',
      entity_id = r.id::text,
      visibility_scope = coalesce(nullif(t.visibility_scope, ''), 'public'),
      workflow_status = case
        when coalesce(t.workflow_status, '') in ('merged', 'archived', 'resolved', 'active') then t.workflow_status
        else 'active'
      end,
      metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
        'phase2NormalizedAt', now(),
        'phase2NormalizedSource', 'phase2_canonical_thread_normalization',
        'requestId', r.id,
        'requestReference', r.request_reference
      ),
      updated_at = now()
    from public.app_booking_requests r
    where
      t.thread_key = r.thread_key
      or t.id = r.thread_id
      or (t.entity_type = 'marketplace_request' and t.entity_id = r.id::text)
      or (t.context_type = 'request' and t.context_id::text = r.id::text)
  $sql$, context_assignment);
end $$;

update public.app_booking_requests r
set
  thread_id = t.id,
  thread_key = t.thread_key,
  updated_at = now()
from public.shared_message_threads t
where t.context_type = 'request'
  and t.context_id::text = r.id::text
  and coalesce(t.workflow_status, 'active') <> 'merged'
  and (
    r.thread_id is distinct from t.id
    or r.thread_key is distinct from t.thread_key
  );

-- ---------------------------------------------------------
-- 2. Backfill canonical verification thread context from cases
-- ---------------------------------------------------------
do $$
declare
  context_id_data_type text;
  context_assignment text;
begin
  select c.data_type
  into context_id_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'shared_message_threads'
    and c.column_name = 'context_id';

  context_assignment := case
    when context_id_data_type = 'uuid' then 'vc.id'
    else 'vc.id::text'
  end;

  execute format($sql$
    update public.shared_message_threads t
    set
      context_type = 'verification',
      context_id = %s,
      family = 'verification',
      thread_type = 'verification',
      entity_type = 'verification',
      entity_id = vc.id::text,
      visibility_scope = 'mixed',
      workflow_status = case
        when coalesce(t.workflow_status, '') in ('merged', 'archived', 'resolved', 'active') then t.workflow_status
        when vc.case_status = 'approved' then 'resolved'
        when vc.case_status in ('archived', 'expired') then 'archived'
        else 'active'
      end,
      metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
        'phase2NormalizedAt', now(),
        'phase2NormalizedSource', 'phase2_canonical_thread_normalization',
        'verificationCaseId', vc.id,
        'ownerUserId', vc.owner_user_id,
        'verificationEntityType', vc.entity_type,
        'verificationEntityId', vc.entity_id
      ),
      updated_at = now()
    from public.verification_cases vc
    where
      t.thread_key = vc.thread_key
      or t.id = vc.thread_id
      or (t.context_type = 'verification' and t.context_id::text = vc.id::text)
      or (
        t.family = 'verification'
        and coalesce(t.metadata ->> 'verificationCaseId', '') = vc.id::text
      )
  $sql$, context_assignment);
end $$;

update public.verification_cases vc
set
  thread_id = t.id,
  thread_key = t.thread_key,
  updated_at = now()
from public.shared_message_threads t
where t.context_type = 'verification'
  and t.context_id::text = vc.id::text
  and coalesce(t.workflow_status, 'active') <> 'merged'
  and (
    vc.thread_id is distinct from t.id
    or vc.thread_key is distinct from t.thread_key
  );

update public.verification_requests vr
set
  verification_case_id = coalesce(vr.verification_case_id, vc.id),
  thread_id = t.id,
  thread_key = t.thread_key,
  workflow_metadata = coalesce(vr.workflow_metadata, '{}'::jsonb) || jsonb_build_object(
    'phase2NormalizedAt', now(),
    'phase2NormalizedSource', 'phase2_canonical_thread_normalization',
    'verificationCaseId', vc.id,
    'canonicalThreadId', t.id,
    'canonicalThreadKey', t.thread_key
  )
from public.verification_cases vc
join public.shared_message_threads t
  on t.context_type = 'verification'
 and t.context_id::text = vc.id::text
 and coalesce(t.workflow_status, 'active') <> 'merged'
where vc.owner_user_id = vr.owner_user_id
  and vc.entity_type = vr.entity_type
  and vc.entity_id = vr.entity_id
  and (
    vr.thread_id is distinct from t.id
    or vr.thread_key is distinct from t.thread_key
    or vr.verification_case_id is distinct from vc.id
  );

-- ---------------------------------------------------------
-- 3. Backfill canonical rental thread context
-- ---------------------------------------------------------
do $$
declare
  context_id_data_type text;
  context_assignment text;
  rental_filter text;
begin
  select c.data_type
  into context_id_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'shared_message_threads'
    and c.column_name = 'context_id';

  if context_id_data_type = 'uuid' then
    context_assignment := 'rc.rental_id::uuid';
    rental_filter := 'and rc.rental_id ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''';
  else
    context_assignment := 'rc.rental_id';
    rental_filter := '';
  end if;

  execute format($sql$
    update public.shared_message_threads t
    set
      context_type = 'rental',
      context_id = %s,
      family = 'bookings',
      thread_type = 'rental_booking',
      entity_type = 'rental',
      entity_id = rc.rental_id,
      visibility_scope = coalesce(nullif(t.visibility_scope, ''), 'public'),
      workflow_status = case
        when coalesce(t.workflow_status, '') in ('merged', 'archived', 'resolved', 'active') then t.workflow_status
        else 'active'
      end,
      metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
        'phase2NormalizedAt', now(),
        'phase2NormalizedSource', 'phase2_canonical_thread_normalization',
        'rentalId', rc.rental_id
      ),
      updated_at = now()
    from (
      select distinct
        coalesce(nullif(trim(context_id::text), ''), nullif(trim(entity_id::text), '')) as rental_id,
        thread_key,
        id
      from public.shared_message_threads
      where context_type = 'rental'
         or entity_type = 'rental'
         or family = 'bookings'
         or thread_type = 'rental_booking'
    ) rc
    where coalesce(trim(rc.rental_id), '') <> ''
      %s
      and (
        t.id = rc.id
        or t.thread_key = rc.thread_key
        or (t.context_type = 'rental' and t.context_id::text = rc.rental_id)
        or (t.entity_type = 'rental' and t.entity_id::text = rc.rental_id)
      )
  $sql$, context_assignment, rental_filter);
end $$;

-- ---------------------------------------------------------
-- 4. Backfill message thread_id from canonical thread state
-- ---------------------------------------------------------
update public.shared_messages m
set thread_id = t.id
from public.shared_message_threads t
where m.thread_id is null
  and m.thread_key = t.thread_key
  and coalesce(t.workflow_status, 'active') <> 'merged';

update public.shared_messages m
set
  thread_id = r.thread_id,
  thread_key = r.thread_key
from public.app_booking_requests r
where r.thread_id is not null
  and (
    m.entity_type = 'marketplace_request'
    and (
      m.entity_id = r.id::text
      or coalesce(m.metadata ->> 'requestId', '') = r.id::text
    )
  )
  and (
    m.thread_id is null
    or m.thread_id is distinct from r.thread_id
    or m.thread_key is distinct from r.thread_key
  );

update public.shared_messages m
set
  thread_id = vr.thread_id,
  thread_key = vr.thread_key
from public.verification_requests vr
where vr.thread_id is not null
  and m.family = 'verification'
  and (
    coalesce(m.metadata ->> 'verificationRequestId', '') = vr.id::text
    or (
      m.entity_type = vr.entity_type
      and m.entity_id = vr.entity_id
      and coalesce(m.metadata ->> 'verificationType', coalesce(m.metadata ->> 'documentType', '')) = vr.verification_type
    )
  )
  and (
    m.thread_id is null
    or m.thread_id is distinct from vr.thread_id
    or m.thread_key is distinct from vr.thread_key
  );

update public.shared_messages m
set thread_id = t.id
from public.shared_message_threads t
where m.thread_id is null
  and t.context_type = 'rental'
  and coalesce(t.workflow_status, 'active') <> 'merged'
  and (
    (m.entity_type = 'rental' and m.entity_id = t.context_id::text)
    or coalesce(m.metadata ->> 'rentalId', '') = t.context_id::text
  );

-- ---------------------------------------------------------
-- 5. Collapse duplicates to one active thread per context
-- ---------------------------------------------------------
drop table if exists pg_temp.phase2_thread_duplicates;
create temporary table phase2_thread_duplicates on commit drop as
with ranked as (
  select
    t.context_type,
    t.context_id::text as context_id,
    t.id as thread_id,
    t.thread_key,
    row_number() over (
      partition by t.context_type, t.context_id
      order by
        case when coalesce(t.workflow_status, 'active') = 'resolved' then 0 else 1 end,
        coalesce(t.last_message_at, t.updated_at, t.created_at) desc nulls last,
        t.updated_at desc nulls last,
        t.created_at desc nulls last,
        t.id
    ) as rn
  from public.shared_message_threads t
  where coalesce(trim(t.context_type), '') <> ''
    and coalesce(trim(t.context_id::text), '') <> ''
    and coalesce(t.workflow_status, 'active') <> 'merged'
)
select
  winner.context_type,
  winner.context_id,
  loser.thread_id as duplicate_thread_id,
  loser.thread_key as duplicate_thread_key,
  winner.thread_id as canonical_thread_id,
  winner.thread_key as canonical_thread_key
from ranked winner
join ranked loser
  on loser.context_type = winner.context_type
 and loser.context_id = winner.context_id
where winner.rn = 1
  and loser.rn > 1;

update public.shared_messages m
set
  thread_id = d.canonical_thread_id,
  thread_key = d.canonical_thread_key
from pg_temp.phase2_thread_duplicates d
where m.thread_id = d.duplicate_thread_id
   or m.thread_key = d.duplicate_thread_key;

update public.app_booking_requests r
set
  thread_id = d.canonical_thread_id,
  thread_key = d.canonical_thread_key,
  updated_at = now()
from pg_temp.phase2_thread_duplicates d
where d.context_type = 'request'
  and d.context_id = r.id::text
  and (
    r.thread_id is distinct from d.canonical_thread_id
    or r.thread_key is distinct from d.canonical_thread_key
  );

update public.verification_cases vc
set
  thread_id = d.canonical_thread_id,
  thread_key = d.canonical_thread_key,
  updated_at = now()
from pg_temp.phase2_thread_duplicates d
where d.context_type = 'verification'
  and d.context_id = vc.id::text
  and (
    vc.thread_id is distinct from d.canonical_thread_id
    or vc.thread_key is distinct from d.canonical_thread_key
  );

update public.verification_requests vr
set
  thread_id = d.canonical_thread_id,
  thread_key = d.canonical_thread_key,
  workflow_metadata = coalesce(vr.workflow_metadata, '{}'::jsonb) || jsonb_build_object(
    'phase2NormalizedAt', now(),
    'phase2NormalizedSource', 'phase2_canonical_thread_normalization',
    'canonicalThreadId', d.canonical_thread_id,
    'canonicalThreadKey', d.canonical_thread_key
  )
from pg_temp.phase2_thread_duplicates d
join public.verification_cases vc
  on vc.id::text = d.context_id
where d.context_type = 'verification'
  and vr.verification_case_id = vc.id
  and (
    vr.thread_id is distinct from d.canonical_thread_id
    or vr.thread_key is distinct from d.canonical_thread_key
  );

update public.shared_message_threads t
set
  merged_into_thread_id = d.canonical_thread_id,
  workflow_status = 'merged',
  archived_at = coalesce(t.archived_at, now()),
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'phase2MergedAt', now(),
    'phase2MergedSource', 'phase2_canonical_thread_normalization',
    'mergedIntoThreadId', d.canonical_thread_id,
    'mergedIntoThreadKey', d.canonical_thread_key
  ),
  updated_at = now()
from pg_temp.phase2_thread_duplicates d
where t.id = d.duplicate_thread_id;

-- ---------------------------------------------------------
-- 6. Enforce one active thread per context
-- ---------------------------------------------------------
create unique index if not exists idx_shared_message_threads_request_context_unique
  on public.shared_message_threads(context_type, context_id)
  where context_type = 'request'
    and coalesce(trim(context_id::text), '') <> ''
    and coalesce(workflow_status, 'active') <> 'merged'
    and archived_at is null;

create unique index if not exists idx_shared_message_threads_verification_context_unique
  on public.shared_message_threads(context_type, context_id)
  where context_type = 'verification'
    and coalesce(trim(context_id::text), '') <> ''
    and coalesce(workflow_status, 'active') <> 'merged'
    and archived_at is null;

create unique index if not exists idx_shared_message_threads_rental_context_unique
  on public.shared_message_threads(context_type, context_id)
  where context_type = 'rental'
    and coalesce(trim(context_id::text), '') <> ''
    and coalesce(workflow_status, 'active') <> 'merged'
    and archived_at is null;

create index if not exists idx_shared_messages_thread_id_created_at
  on public.shared_messages(thread_id, created_at desc)
  where thread_id is not null;

create or replace view public.thread_context_normalization_validation as
select
  t.context_type,
  t.context_id::text as context_id,
  count(*) as active_thread_count,
  array_agg(t.id order by coalesce(t.last_message_at, t.updated_at, t.created_at) desc nulls last) as thread_ids,
  array_agg(t.thread_key order by coalesce(t.last_message_at, t.updated_at, t.created_at) desc nulls last) as thread_keys,
  max(t.updated_at) as last_updated_at
from public.shared_message_threads t
where coalesce(trim(t.context_type), '') <> ''
  and coalesce(trim(t.context_id::text), '') <> ''
  and coalesce(t.workflow_status, 'active') <> 'merged'
group by t.context_type, t.context_id;

create or replace view public.shared_message_orphan_validation as
select
  m.id as message_id,
  m.thread_key,
  m.thread_id,
  m.family,
  m.thread_type,
  m.entity_type,
  m.entity_id,
  m.created_at
from public.shared_messages m
left join public.shared_message_threads t
  on t.id = m.thread_id
where m.thread_id is null
   or t.id is null;

notify pgrst, 'reload schema';
