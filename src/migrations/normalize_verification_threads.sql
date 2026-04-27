-- =========================================================
-- Normalize verification threads
-- Step 6 of the messaging audit plan
--
-- Goals:
-- - create one verification case per owner/entity journey
-- - create one canonical verification thread per case
-- - link verification requests to that case/thread
-- - backfill verification lifecycle into thread_events
-- - keep shared_messages and verification_events intact
-- =========================================================

create extension if not exists pgcrypto;

create or replace function public.build_verification_case_thread_key(p_case_id uuid)
returns text
language sql
immutable
as $$
  select 'verification:' || p_case_id::text;
$$;

create table if not exists public.verification_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null,
  entity_type text not null,
  entity_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  case_status text not null default 'pending',
  required_documents jsonb not null default '[]'::jsonb,
  submitted_documents jsonb not null default '[]'::jsonb,
  thread_id uuid references public.shared_message_threads(id) on delete set null,
  thread_key text,
  opened_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  suspended_at timestamptz,
  expired_at timestamptz,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verification_cases_case_type_check'
  ) then
    alter table public.verification_cases
      add constraint verification_cases_case_type_check
      check (case_type in ('profile', 'vehicle'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verification_cases_case_status_check'
  ) then
    alter table public.verification_cases
      add constraint verification_cases_case_status_check
      check (case_status in ('pending', 'under_review', 'approved', 'rejected', 'suspended', 'expired', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verification_cases_owner_entity_unique'
  ) then
    alter table public.verification_cases
      add constraint verification_cases_owner_entity_unique
      unique (case_type, entity_type, entity_id, owner_user_id);
  end if;
end $$;

create or replace function public.app_set_verification_cases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_verification_cases_updated_at on public.verification_cases;
create trigger trg_verification_cases_updated_at
before update on public.verification_cases
for each row
execute function public.app_set_verification_cases_updated_at();

alter table public.verification_requests
  add column if not exists verification_case_id uuid references public.verification_cases(id) on delete set null,
  add column if not exists thread_id uuid,
  add column if not exists thread_key text,
  add column if not exists workflow_metadata jsonb not null default '{}'::jsonb;

insert into public.verification_cases (
  id,
  case_type,
  entity_type,
  entity_id,
  owner_user_id,
  case_status,
  required_documents,
  submitted_documents,
  opened_at,
  created_at,
  updated_at,
  metadata
)
select
  gen_random_uuid(),
  case
    when lower(coalesce(vr.entity_type, '')) = 'user' then 'profile'
    else 'vehicle'
  end,
  vr.entity_type,
  vr.entity_id,
  vr.owner_user_id,
  case
    when bool_or(vr.status = 'rejected') then 'rejected'
    when bool_or(vr.status = 'suspended') then 'suspended'
    when bool_or(vr.status = 'expired') then 'expired'
    when bool_and(vr.status = 'approved') then 'approved'
    when bool_or(vr.status = 'approved') and bool_or(vr.status = 'pending') then 'under_review'
    else 'pending'
  end,
  jsonb_agg(distinct to_jsonb(vr.verification_type)) filter (where vr.verification_type is not null),
  jsonb_agg(
    distinct jsonb_build_object(
      'verificationRequestId', vr.id,
      'type', vr.verification_type,
      'status', vr.status,
      'fileName', vr.file_name,
      'fileUrl', vr.file_url
    )
  ),
  min(vr.created_at),
  min(vr.created_at),
  now(),
  jsonb_build_object(
    'normalizedAt', now(),
    'normalizedSource', 'normalize_verification_threads'
  )
from public.verification_requests vr
where not exists (
  select 1
  from public.verification_cases vc
  where vc.owner_user_id = vr.owner_user_id
    and vc.entity_type = vr.entity_type
    and vc.entity_id = vr.entity_id
    and vc.case_type = case when lower(coalesce(vr.entity_type, '')) = 'user' then 'profile' else 'vehicle' end
)
group by vr.owner_user_id, vr.entity_type, vr.entity_id;

update public.verification_cases vc
set
  case_status = rolled.rolled_status,
  required_documents = rolled.required_documents,
  submitted_documents = rolled.submitted_documents,
  opened_at = coalesce(vc.opened_at, rolled.opened_at),
  approved_at = case when rolled.rolled_status = 'approved' then coalesce(vc.approved_at, now()) else vc.approved_at end,
  rejected_at = case when rolled.rolled_status = 'rejected' then coalesce(vc.rejected_at, now()) else vc.rejected_at end,
  suspended_at = case when rolled.rolled_status = 'suspended' then coalesce(vc.suspended_at, now()) else vc.suspended_at end,
  expired_at = case when rolled.rolled_status = 'expired' then coalesce(vc.expired_at, now()) else vc.expired_at end,
  reviewed_at = case when rolled.rolled_status in ('approved', 'rejected', 'suspended', 'expired', 'under_review') then coalesce(vc.reviewed_at, now()) else vc.reviewed_at end,
  metadata = coalesce(vc.metadata, '{}'::jsonb) || jsonb_build_object(
    'normalizedAt', now(),
    'normalizedSource', 'normalize_verification_threads'
  ),
  updated_at = now()
from (
  select
    vr.owner_user_id,
    vr.entity_type,
    vr.entity_id,
    case
      when bool_or(vr.status = 'rejected') then 'rejected'
      when bool_or(vr.status = 'suspended') then 'suspended'
      when bool_or(vr.status = 'expired') then 'expired'
      when bool_and(vr.status = 'approved') then 'approved'
      when bool_or(vr.status = 'approved') and bool_or(vr.status = 'pending') then 'under_review'
      else 'pending'
    end as rolled_status,
    jsonb_agg(distinct to_jsonb(vr.verification_type)) filter (where vr.verification_type is not null) as required_documents,
    jsonb_agg(
      distinct jsonb_build_object(
        'verificationRequestId', vr.id,
        'type', vr.verification_type,
        'status', vr.status,
        'fileName', vr.file_name,
        'fileUrl', vr.file_url
      )
    ) as submitted_documents,
    min(vr.created_at) as opened_at
  from public.verification_requests vr
  group by vr.owner_user_id, vr.entity_type, vr.entity_id
) rolled
where vc.owner_user_id = rolled.owner_user_id
  and vc.entity_type = rolled.entity_type
  and vc.entity_id = rolled.entity_id;

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
  public.build_verification_case_thread_key(vc.id),
  'verification',
  'verification',
  'verification',
  vc.id::text,
  vc.owner_user_id,
  vc.owner_user_id,
  'normal',
  case
    when vc.case_status in ('pending', 'under_review') then 'admin'
    when vc.case_status = 'rejected' then 'customer'
    else null
  end,
  'verification',
  vc.id::text,
  case
    when vc.case_status = 'approved' then 'resolved'
    when vc.case_status in ('archived', 'expired') then 'archived'
    else 'active'
  end,
  'mixed',
  null,
  coalesce(vc.opened_at, vc.created_at, now()),
  now(),
  jsonb_build_object(
    'verificationCaseId', vc.id,
    'entityType', vc.entity_type,
    'entityId', vc.entity_id,
    'ownerUserId', vc.owner_user_id,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_verification_threads'
  )
from public.verification_cases vc
where not exists (
  select 1
  from public.shared_message_threads t
  where t.thread_key = public.build_verification_case_thread_key(vc.id)
     or (t.context_type = 'verification' and t.context_id = vc.id::text and coalesce(t.workflow_status, 'active') <> 'merged')
);

update public.verification_cases vc
set
  thread_id = t.id,
  thread_key = t.thread_key,
  metadata = coalesce(vc.metadata, '{}'::jsonb) || jsonb_build_object(
    'threadNormalizedAt', now(),
    'canonicalThreadKey', t.thread_key
  ),
  updated_at = now()
from public.shared_message_threads t
where t.thread_key = public.build_verification_case_thread_key(vc.id)
  and (
    vc.thread_id is distinct from t.id
    or vc.thread_key is distinct from t.thread_key
  );

update public.verification_requests vr
set
  verification_case_id = vc.id,
  thread_id = vc.thread_id,
  thread_key = vc.thread_key,
  workflow_metadata = coalesce(vr.workflow_metadata, '{}'::jsonb) || jsonb_build_object(
    'verificationCaseId', vc.id,
    'threadNormalizedAt', now(),
    'canonicalThreadKey', vc.thread_key
  )
from public.verification_cases vc
where vc.owner_user_id = vr.owner_user_id
  and vc.entity_type = vr.entity_type
  and vc.entity_id = vr.entity_id
  and vc.case_type = case when lower(coalesce(vr.entity_type, '')) = 'user' then 'profile' else 'vehicle' end
  and (
    vr.verification_case_id is distinct from vc.id
    or vr.thread_id is distinct from vc.thread_id
    or vr.thread_key is distinct from vc.thread_key
  );

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
  vc.thread_id,
  vc.owner_user_id,
  'customer',
  'public',
  true,
  jsonb_build_object(
    'contextType', 'verification',
    'contextId', vc.id,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_verification_threads'
  ),
  now(),
  now()
from public.verification_cases vc
where vc.thread_id is not null
on conflict (thread_id, user_id) do update
set
  participant_role = excluded.participant_role,
  visibility_scope = excluded.visibility_scope,
  is_primary = public.shared_message_participants.is_primary or excluded.is_primary,
  metadata = coalesce(public.shared_message_participants.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

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
select distinct
  vc.thread_id,
  admin_users.user_id,
  'admin',
  'internal',
  false,
  jsonb_build_object(
    'contextType', 'verification',
    'contextId', vc.id,
    'normalizedAt', now(),
    'normalizedSource', 'normalize_verification_threads'
  ),
  now(),
  now()
from public.verification_cases vc
join lateral (
  select distinct m.sender_user_id as user_id
  from public.shared_messages m
  where m.thread_key = vc.thread_key
    and m.sender_user_id is not null
    and lower(coalesce(m.sender_role, '')) in ('admin', 'support')
  union
  select distinct m.recipient_user_id as user_id
  from public.shared_messages m
  where m.thread_key = vc.thread_key
    and m.recipient_user_id is not null
    and lower(coalesce(m.recipient_role, '')) in ('admin', 'support')
) admin_users on true
where vc.thread_id is not null
on conflict (thread_id, user_id) do update
set
  participant_role = 'admin',
  visibility_scope = 'internal',
  metadata = coalesce(public.shared_message_participants.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

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
  vc.thread_id,
  'verification',
  vc.id::text,
  'submission',
  'Verification submitted',
  coalesce(vr.notes, concat(coalesce(vr.file_name, vr.verification_type), ' submitted for review')),
  vr.owner_user_id,
  case when lower(coalesce(vr.entity_type, '')) = 'vehicle' then 'owner' else 'customer' end,
  jsonb_strip_nulls(
    jsonb_build_object(
      'verificationCaseId', vc.id,
      'verificationRequestId', vr.id,
      'entityType', vr.entity_type,
      'entityId', vr.entity_id,
      'verificationType', vr.verification_type,
      'status', vr.status,
      'fileName', vr.file_name,
      'fileUrl', vr.file_url
    )
  ),
  'verification_requests',
  vr.id::text,
  coalesce(vr.created_at, now()),
  now()
from public.verification_requests vr
join public.verification_cases vc
  on vc.id = vr.verification_case_id
where vc.thread_id is not null
  and not exists (
    select 1
    from public.thread_events e
    where e.thread_id = vc.thread_id
      and e.source_table = 'verification_requests'
      and e.source_row_id = vr.id::text
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
  vc.thread_id,
  'verification',
  vc.id::text,
  case
    when lower(coalesce(ve.to_status, ve.action, '')) = 'approved' then 'approval'
    when lower(coalesce(ve.to_status, ve.action, '')) in ('rejected', 'suspended', 'expired') then 'rejection'
    else 'status_update'
  end,
  case
    when lower(coalesce(ve.to_status, ve.action, '')) = 'approved' then 'Verification approved'
    when lower(coalesce(ve.to_status, ve.action, '')) = 'rejected' then 'Verification rejected'
    when lower(coalesce(ve.to_status, ve.action, '')) = 'suspended' then 'Verification suspended'
    when lower(coalesce(ve.to_status, ve.action, '')) = 'expired' then 'Verification expired'
    else 'Verification updated'
  end,
  coalesce(nullif(trim(ve.note), ''), concat('Status changed to ', coalesce(ve.to_status, ve.action))),
  ve.actor_user_id,
  case
    when ve.actor_user_id = vr.owner_user_id then case when lower(coalesce(vr.entity_type, '')) = 'vehicle' then 'owner' else 'customer' end
    else 'admin'
  end,
  jsonb_strip_nulls(
    jsonb_build_object(
      'verificationCaseId', vc.id,
      'verificationRequestId', vr.id,
      'action', ve.action,
      'fromStatus', ve.from_status,
      'toStatus', ve.to_status,
      'note', ve.note
    )
  ),
  'verification_events',
  ve.id::text,
  coalesce(ve.created_at, now()),
  now()
from public.verification_events ve
join public.verification_requests vr
  on vr.id = ve.verification_request_id
join public.verification_cases vc
  on vc.id = vr.verification_case_id
where vc.thread_id is not null
  and not exists (
    select 1
    from public.thread_events e
    where e.thread_id = vc.thread_id
      and e.source_table = 'verification_events'
      and e.source_row_id = ve.id::text
  );

drop table if exists pg_temp.verification_duplicate_threads;
create temporary table verification_duplicate_threads on commit drop as
with ranked as (
  select
    vc.id as case_id,
    vc.thread_id as canonical_thread_id,
    vc.thread_key as canonical_thread_key,
    t.id as thread_id,
    t.thread_key,
    row_number() over (
      partition by vc.id
      order by
        case when t.id = vc.thread_id then 0 else 1 end,
        t.updated_at desc nulls last,
        t.created_at desc nulls last,
        t.id
    ) as rn
  from public.verification_cases vc
  join public.shared_message_threads t
    on (
      t.thread_key = vc.thread_key
      or (t.context_type = 'verification' and t.context_id = vc.id::text)
      or (t.family = 'verification' and t.entity_type = vc.entity_type and t.entity_id = vc.entity_id)
    )
)
select
  case_id,
  thread_id as duplicate_thread_id,
  thread_key as duplicate_thread_key,
  canonical_thread_id,
  canonical_thread_key
from ranked
where rn > 1;

update public.shared_message_threads t
set
  merged_into_thread_id = d.canonical_thread_id,
  workflow_status = 'merged',
  archived_at = coalesce(t.archived_at, now()),
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'mergedAt', now(),
    'mergedIntoThreadId', d.canonical_thread_id,
    'mergedIntoThreadKey', d.canonical_thread_key,
    'mergeReason', 'duplicate_verification_thread'
  ),
  updated_at = now()
from verification_duplicate_threads d
where t.id = d.duplicate_thread_id
  and t.id <> d.canonical_thread_id;

update public.shared_messages m
set
  thread_key = d.canonical_thread_key,
  metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
    'normalizedAt', now(),
    'normalizedSource', 'normalize_verification_threads',
    'verificationCaseId', d.case_id,
    'originalThreadKey', m.thread_key
  )
from verification_duplicate_threads d
where m.thread_key = d.duplicate_thread_key;

create unique index if not exists idx_verification_cases_thread_key
  on public.verification_cases(thread_key)
  where thread_key is not null;

create unique index if not exists idx_shared_message_threads_verification_context_unique
  on public.shared_message_threads(context_type, context_id)
  where context_type = 'verification'
    and context_id is not null
    and coalesce(workflow_status, 'active') <> 'merged';

create index if not exists idx_verification_requests_case_id
  on public.verification_requests(verification_case_id)
  where verification_case_id is not null;

notify pgrst, 'reload schema';
