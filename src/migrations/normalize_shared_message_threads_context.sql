-- =========================================================
-- Normalize shared_message_threads toward canonical context threads
-- Step 2 of the messaging audit plan
--
-- Goals:
-- - keep the existing thread system running
-- - add real context-based fields without deleting legacy fields
-- - prepare for one-thread-per-context enforcement later
-- =========================================================

create extension if not exists pgcrypto;

alter table public.shared_message_threads
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists context_type text,
  add column if not exists context_id text,
  add column if not exists workflow_status text not null default 'active',
  add column if not exists visibility_scope text not null default 'public',
  add column if not exists merged_into_thread_id uuid,
  add column if not exists last_message_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_threads_workflow_status_check'
  ) then
    alter table public.shared_message_threads
      add constraint shared_message_threads_workflow_status_check
      check (workflow_status in ('active', 'resolved', 'archived', 'merged'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_threads_visibility_scope_check'
  ) then
    alter table public.shared_message_threads
      add constraint shared_message_threads_visibility_scope_check
      check (visibility_scope in ('public', 'internal', 'mixed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_message_threads_merged_into_thread_id_fkey'
  ) then
    alter table public.shared_message_threads
      add constraint shared_message_threads_merged_into_thread_id_fkey
      foreign key (merged_into_thread_id)
      references public.shared_message_threads(id)
      on delete set null;
  end if;
end $$;

update public.shared_message_threads
set workflow_status = case
  when merged_into_thread_id is not null then 'merged'
  when resolved_at is not null then 'resolved'
  when archived_at is not null then 'archived'
  else 'active'
end
where workflow_status is null
   or workflow_status not in ('active', 'resolved', 'archived', 'merged');

update public.shared_message_threads
set visibility_scope = case
  when family in ('verification', 'support', 'account_trust') then 'mixed'
  else 'public'
end
where visibility_scope is null
   or visibility_scope not in ('public', 'internal', 'mixed');

update public.shared_message_threads
set
  context_type = 'request',
  context_id = coalesce(context_id, nullif(entity_id, '')),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'normalizedContextAt', now(),
    'normalizedContextSource', 'normalize_shared_message_threads_context',
    'legacyFamily', family,
    'legacyThreadType', thread_type
  )
where context_type is null
  and (
    entity_type = 'marketplace_request'
    or family = 'marketplace'
    or thread_type in ('marketplace_customer_request', 'marketplace_owner_request')
  );

update public.shared_message_threads
set
  context_type = 'verification',
  context_id = coalesce(
    context_id,
    case
      when coalesce(entity_id, '') <> '' then concat_ws(':', lower(coalesce(entity_type, 'verification')), entity_id)
      else null
    end
  ),
  visibility_scope = 'mixed',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'normalizedContextAt', now(),
    'normalizedContextSource', 'normalize_shared_message_threads_context',
    'legacyFamily', family,
    'legacyThreadType', thread_type
  )
where context_type is null
  and (
    family = 'verification'
    or thread_type in ('verification', 'verification_document', 'verification_status')
  );

update public.shared_message_threads
set
  context_type = 'rental',
  context_id = coalesce(context_id, nullif(entity_id, '')),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'normalizedContextAt', now(),
    'normalizedContextSource', 'normalize_shared_message_threads_context',
    'legacyFamily', family,
    'legacyThreadType', thread_type
  )
where context_type is null
  and (
    entity_type = 'rental'
    or family = 'bookings'
    or thread_type = 'rental_booking'
  );

update public.shared_message_threads
set
  context_type = 'support',
  context_id = coalesce(context_id, nullif(entity_id, ''), thread_key),
  visibility_scope = case
    when visibility_scope = 'public' then 'mixed'
    else visibility_scope
  end,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'normalizedContextAt', now(),
    'normalizedContextSource', 'normalize_shared_message_threads_context',
    'legacyFamily', family,
    'legacyThreadType', thread_type
  )
where context_type is null;

update public.shared_message_threads t
set last_message_at = latest.last_message_at
from (
  select
    m.thread_key,
    max(m.created_at) as last_message_at
  from public.shared_messages m
  group by m.thread_key
) latest
where latest.thread_key = t.thread_key
  and (
    t.last_message_at is null
    or t.last_message_at is distinct from latest.last_message_at
  );

create index if not exists idx_shared_message_threads_id
  on public.shared_message_threads(id);

create index if not exists idx_shared_message_threads_context_type_context_id
  on public.shared_message_threads(context_type, context_id)
  where context_type is not null and context_id is not null;

create index if not exists idx_shared_message_threads_workflow_status_updated_at
  on public.shared_message_threads(workflow_status, updated_at desc);

create index if not exists idx_shared_message_threads_last_message_at
  on public.shared_message_threads(last_message_at desc nulls last);

create index if not exists idx_shared_message_threads_merged_into_thread_id
  on public.shared_message_threads(merged_into_thread_id)
  where merged_into_thread_id is not null;

notify pgrst, 'reload schema';
