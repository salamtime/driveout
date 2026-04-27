with canonical_threads as (
  select
    id,
    thread_key,
    family,
    thread_type,
    entity_type,
    entity_id,
    created_at,
    concat(
      'verification:verification:',
      lower(coalesce(entity_type, 'user')),
      ':',
      coalesce(entity_id, 'unknown')
    ) as canonical_thread_key
  from public.shared_messages
  where family = 'verification'
),
oldest_thread_per_entity as (
  select distinct on (canonical_thread_key)
    canonical_thread_key,
    thread_key as oldest_thread_key
  from canonical_threads
  order by canonical_thread_key, created_at asc, id asc
),
rewired_messages as (
  update public.shared_messages sm
  set thread_key = otp.oldest_thread_key
  from canonical_threads ct
  join oldest_thread_per_entity otp
    on otp.canonical_thread_key = ct.canonical_thread_key
  where sm.id = ct.id
    and sm.thread_key <> otp.oldest_thread_key
  returning sm.id
),
deduped_thread_state as (
  delete from public.shared_message_threads st
  using (
    select
      thread_key,
      concat(
        'verification:verification:',
        lower(coalesce(entity_type, 'user')),
        ':',
        coalesce(entity_id, 'unknown')
      ) as canonical_thread_key
    from public.shared_message_threads
    where family = 'verification'
  ) legacy
  join oldest_thread_per_entity otp
    on otp.canonical_thread_key = legacy.canonical_thread_key
  where st.thread_key = legacy.thread_key
    and st.thread_key <> otp.oldest_thread_key
  returning st.thread_key
)
select
  (select count(*) from rewired_messages) as rewired_message_count,
  (select count(*) from deduped_thread_state) as removed_thread_state_count;
