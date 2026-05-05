begin;

create extension if not exists pgcrypto;

do $$
declare
  platform_org_id uuid;
  table_name text;
  constraint_name text;
  tenant_tables_with_uuid_org text[] := array[
    'pricing_tiers',
    'rental_extensions',
    'app_687f658e98_tour_package_model_prices',
    'tour_vehicle_snapshots',
    'fuel_tank',
    'fuel_refills',
    'vehicle_fuel_refills',
    'fuel_withdrawals',
    'vehicle_fuel_state',
    'fuel_operation_logs',
    'shared_message_threads',
    'shared_message_participants',
    'shared_messages',
    'shared_message_media',
    'verification_requests',
    'verification_events',
    'short_links',
    'app_vehicle_public_profiles',
    'app_marketplace_listings',
    'app_booking_requests',
    'app_booking_messages'
  ];
begin
  insert into public.app_organizations (
    name,
    slug,
    organization_type,
    organization_status,
    is_platform_organization
  )
  values (
    'DriveOut Platform',
    'driveout-platform',
    'platform',
    'active',
    true
  )
  on conflict (slug) do update
  set updated_at = now()
  returning id into platform_org_id;

  foreach table_name in array tenant_tables_with_uuid_org loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists organization_id uuid',
      table_name
    );

    constraint_name := 'fk_org_' || substr(md5(table_name || '_organization_id'), 1, 20);

    if not exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any(c.conkey)
      where c.contype = 'f'
        and c.conrelid = to_regclass('public.' || table_name)
        and c.confrelid = 'public.app_organizations'::regclass
        and a.attname = 'organization_id'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id) references public.app_organizations(id) on delete set null',
        table_name,
        constraint_name
      );
    end if;

    execute format(
      'create index if not exists %I on public.%I (organization_id)',
      'idx_' || table_name || '_organization_id',
      table_name
    );
  end loop;

  if to_regclass('public.pricing_tiers') is not null then
    update public.pricing_tiers
    set organization_id = platform_org_id
    where organization_id is null;
  end if;

  if to_regclass('public.rental_extensions') is not null
     and to_regclass('public.app_4c3a7a6153_rentals') is not null then
    update public.rental_extensions ext
    set organization_id = rentals.organization_id
    from public.app_4c3a7a6153_rentals rentals
    where ext.rental_id = rentals.id
      and ext.organization_id is null
      and rentals.organization_id is not null;
  end if;

  if to_regclass('public.app_687f658e98_tour_package_model_prices') is not null
     and to_regclass('public.app_687f658e98_tour_packages') is not null then
    update public.app_687f658e98_tour_package_model_prices prices
    set organization_id = packages.organization_id
    from public.app_687f658e98_tour_packages packages
    where prices.package_id::text = packages.id::text
      and prices.organization_id is null
      and packages.organization_id is not null;
  end if;

  if to_regclass('public.tour_vehicle_snapshots') is not null then
    if to_regclass('public.app_4c3a7a6153_rentals') is not null then
      update public.tour_vehicle_snapshots snapshots
      set organization_id = rentals.organization_id
      from public.app_4c3a7a6153_rentals rentals
      where snapshots.booking_row_id = rentals.id
        and snapshots.organization_id is null
        and rentals.organization_id is not null;
    end if;

    if to_regclass('public.saharax_0u4w4d_vehicles') is not null then
      update public.tour_vehicle_snapshots snapshots
      set organization_id = vehicles.organization_id
      from public.saharax_0u4w4d_vehicles vehicles
      where snapshots.vehicle_id = vehicles.id
        and snapshots.organization_id is null
        and vehicles.organization_id is not null;
    end if;
  end if;

  if to_regclass('public.fuel_refills') is not null then
    if to_regclass('public.saharax_0u4w4d_vehicles') is not null then
      update public.fuel_refills refills
      set organization_id = vehicles.organization_id
      from public.saharax_0u4w4d_vehicles vehicles
      where refills.vehicle_id = vehicles.id
        and refills.organization_id is null
        and vehicles.organization_id is not null;
    end if;

    update public.fuel_refills refills
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where refills.performed_by_user_id = users.id
      and refills.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.vehicle_fuel_refills') is not null then
    if to_regclass('public.saharax_0u4w4d_vehicles') is not null then
      update public.vehicle_fuel_refills refills
      set organization_id = vehicles.organization_id
      from public.saharax_0u4w4d_vehicles vehicles
      where refills.vehicle_id = vehicles.id
        and refills.organization_id is null
        and vehicles.organization_id is not null;
    end if;

    update public.vehicle_fuel_refills refills
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where coalesce(refills.performed_by_user_id, refills.created_by) = users.id
      and refills.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.fuel_withdrawals') is not null then
    if to_regclass('public.saharax_0u4w4d_vehicles') is not null then
      update public.fuel_withdrawals withdrawals
      set organization_id = vehicles.organization_id
      from public.saharax_0u4w4d_vehicles vehicles
      where withdrawals.vehicle_id = vehicles.id
        and withdrawals.organization_id is null
        and vehicles.organization_id is not null;
    end if;

    update public.fuel_withdrawals withdrawals
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where withdrawals.performed_by_user_id = users.id
      and withdrawals.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.vehicle_fuel_state') is not null
     and to_regclass('public.saharax_0u4w4d_vehicles') is not null then
    update public.vehicle_fuel_state state
    set organization_id = vehicles.organization_id
    from public.saharax_0u4w4d_vehicles vehicles
    where state.vehicle_id = vehicles.id
      and state.organization_id is null
      and vehicles.organization_id is not null;
  end if;

  if to_regclass('public.fuel_operation_logs') is not null then
    if to_regclass('public.app_4c3a7a6153_rentals') is not null then
      update public.fuel_operation_logs logs
      set organization_id = rentals.organization_id
      from public.app_4c3a7a6153_rentals rentals
      where logs.rental_id = rentals.id
        and logs.organization_id is null
        and rentals.organization_id is not null;
    end if;

    if to_regclass('public.saharax_0u4w4d_vehicles') is not null then
      update public.fuel_operation_logs logs
      set organization_id = vehicles.organization_id
      from public.saharax_0u4w4d_vehicles vehicles
      where logs.vehicle_id = vehicles.id
        and logs.organization_id is null
        and vehicles.organization_id is not null;
    end if;

    update public.fuel_operation_logs logs
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where logs.performed_by_user_id = users.id
      and logs.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.shared_message_threads') is not null then
    update public.shared_message_threads threads
    set organization_id = coalesce(sender.primary_organization_id, recipient.primary_organization_id, platform_org_id)
    from public.app_b30c02e74da644baad4668e3587d86b1_users sender
    left join public.app_b30c02e74da644baad4668e3587d86b1_users recipient
      on recipient.id = threads.recipient_user_id
    where sender.id = threads.sender_user_id
      and threads.organization_id is null;
  end if;

  if to_regclass('public.shared_message_participants') is not null
     and to_regclass('public.shared_message_threads') is not null then
    update public.shared_message_participants participants
    set organization_id = threads.organization_id
    from public.shared_message_threads threads
    where participants.thread_id = threads.id
      and participants.organization_id is null
      and threads.organization_id is not null;
  end if;

  if to_regclass('public.shared_messages') is not null
     and to_regclass('public.shared_message_threads') is not null then
    update public.shared_messages messages
    set organization_id = threads.organization_id
    from public.shared_message_threads threads
    where messages.thread_id = threads.id
      and messages.organization_id is null
      and threads.organization_id is not null;
  end if;

  if to_regclass('public.shared_message_media') is not null then
    if to_regclass('public.shared_messages') is not null then
      update public.shared_message_media media
      set organization_id = messages.organization_id
      from public.shared_messages messages
      where media.message_id = messages.id
        and media.organization_id is null
        and messages.organization_id is not null;
    end if;

    if to_regclass('public.shared_message_threads') is not null then
      update public.shared_message_media media
      set organization_id = threads.organization_id
      from public.shared_message_threads threads
      where media.thread_key = threads.thread_key
        and media.organization_id is null
        and threads.organization_id is not null;
    end if;
  end if;

  if to_regclass('public.verification_requests') is not null then
    update public.verification_requests requests
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where requests.owner_user_id = users.id
      and requests.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.verification_events') is not null
     and to_regclass('public.verification_requests') is not null then
    update public.verification_events events
    set organization_id = requests.organization_id
    from public.verification_requests requests
    where events.verification_request_id = requests.id
      and events.organization_id is null
      and requests.organization_id is not null;
  end if;

  if to_regclass('public.short_links') is not null
     and to_regclass('public.app_4c3a7a6153_rentals') is not null then
    update public.short_links links
    set organization_id = rentals.organization_id
    from public.app_4c3a7a6153_rentals rentals
    where links.rental_id = rentals.id
      and links.organization_id is null
      and rentals.organization_id is not null;
  end if;

  if to_regclass('public.app_vehicle_public_profiles') is not null then
    update public.app_vehicle_public_profiles profiles
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where profiles.owner_id = users.id
      and profiles.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.app_marketplace_listings') is not null then
    if to_regclass('public.app_vehicle_public_profiles') is not null then
      update public.app_marketplace_listings listings
      set organization_id = profiles.organization_id
      from public.app_vehicle_public_profiles profiles
      where listings.vehicle_public_profile_id = profiles.id
        and listings.organization_id is null
        and profiles.organization_id is not null;
    end if;

    update public.app_marketplace_listings listings
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where listings.owner_id = users.id
      and listings.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.app_booking_requests') is not null then
    if to_regclass('public.app_marketplace_listings') is not null then
      update public.app_booking_requests requests
      set organization_id = listings.organization_id
      from public.app_marketplace_listings listings
      where requests.listing_id = listings.id
        and requests.organization_id is null
        and listings.organization_id is not null;
    end if;

    update public.app_booking_requests requests
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where requests.owner_id = users.id
      and requests.organization_id is null
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.app_booking_messages') is not null
     and to_regclass('public.app_booking_requests') is not null then
    update public.app_booking_messages messages
    set organization_id = requests.organization_id
    from public.app_booking_requests requests
    where messages.booking_request_id = requests.id
      and messages.organization_id is null
      and requests.organization_id is not null;
  end if;

  foreach table_name in array tenant_tables_with_uuid_org loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format(
      'update public.%I set organization_id = $1 where organization_id is null',
      table_name
    ) using platform_org_id;
  end loop;
end $$;

create or replace view public.fuel_transactions_default_feed as
with refill_rows as (
  select
    'refill-' || fr.id::text as id,
    coalesce(fr.organization_id, v.organization_id) as organization_id,
    coalesce(fr.refill_date, fr.created_at) as transaction_date,
    case
      when fr.vehicle_id is null then 'tank_refill'
      else 'vehicle_refill'
    end as transaction_type,
    coalesce(fr.fuel_type, 'gasoline') as fuel_type,
    coalesce(fr.liters_added, 0)::numeric as amount,
    coalesce(fr.total_cost, 0)::numeric as cost,
    coalesce(fr.unit_price, fr.cost_per_liter, 0)::numeric as unit_price,
    fr.fuel_station,
    fr.location,
    null::integer as odometer_reading,
    fr.notes,
    fr.refilled_by as filled_by,
    fr.refilled_by as performed_by_name,
    null::uuid as performed_by_user_id,
    fr.vehicle_id,
    v.name as vehicle_name,
    v.plate_number as vehicle_plate,
    v.model as vehicle_model,
    v.vehicle_type,
    fr.created_at,
    case
      when fr.vehicle_id is null then 'tank_refill'
      else 'direct_station'
    end as source,
    true as is_financial_expense,
    coalesce(fr.invoice_image, to_jsonb(fr.invoice_photo_url), to_jsonb(fr.invoice_url)) as receipt_media,
    coalesce(fr.invoice_image, to_jsonb(fr.invoice_photo_url), to_jsonb(fr.invoice_url)) as invoice_image,
    null::uuid as rental_id,
    null::text as rental_reference,
    null::numeric as fuel_lines_before,
    null::numeric as fuel_lines_after,
    null::numeric as liters_before,
    null::numeric as liters_after
  from public.fuel_refills fr
  left join public.saharax_0u4w4d_vehicles v on v.id = fr.vehicle_id
),
withdrawal_rows as (
  select
    'withdrawal-' || fw.id::text as id,
    coalesce(fw.organization_id, v.organization_id) as organization_id,
    coalesce(fw.withdrawal_date, fw.created_at) as transaction_date,
    coalesce(fw.transaction_type, 'withdrawal') as transaction_type,
    'gasoline'::text as fuel_type,
    coalesce(fw.liters_taken, 0)::numeric as amount,
    coalesce(fw.total_cost, 0)::numeric as cost,
    coalesce(fw.unit_price, 0)::numeric as unit_price,
    null::text as fuel_station,
    null::text as location,
    fw.odometer_reading,
    fw.notes,
    fw.filled_by as filled_by,
    coalesce(fw.performed_by_name, fw.filled_by, 'System') as performed_by_name,
    fw.performed_by_user_id,
    fw.vehicle_id,
    v.name as vehicle_name,
    v.plate_number as vehicle_plate,
    v.model as vehicle_model,
    v.vehicle_type,
    fw.created_at,
    coalesce(fw.source, 'tank_transfer') as source,
    coalesce(fw.is_financial_expense, false) as is_financial_expense,
    null::jsonb as receipt_media,
    null::jsonb as invoice_image,
    null::uuid as rental_id,
    null::text as rental_reference,
    null::numeric as fuel_lines_before,
    null::numeric as fuel_lines_after,
    null::numeric as liters_before,
    null::numeric as liters_after
  from public.fuel_withdrawals fw
  left join public.saharax_0u4w4d_vehicles v on v.id = fw.vehicle_id
),
operation_log_rows as (
  select
    'log-' || fol.id::text as id,
    coalesce(fol.organization_id, r.organization_id, v.organization_id) as organization_id,
    coalesce(fol.created_at, now()) as transaction_date,
    fol.transaction_type,
    coalesce(fol.fuel_type, 'gasoline') as fuel_type,
    coalesce(fol.liters, 0)::numeric as amount,
    coalesce(fol.total_cost, 0)::numeric as cost,
    coalesce(fol.unit_price, 0)::numeric as unit_price,
    fol.fuel_station,
    fol.location,
    fol.odometer_reading,
    fol.notes,
    fol.performed_by_name as filled_by,
    coalesce(fol.performed_by_name, 'System') as performed_by_name,
    fol.performed_by_user_id,
    coalesce(fol.vehicle_id, r.vehicle_id) as vehicle_id,
    v.name as vehicle_name,
    v.plate_number as vehicle_plate,
    v.model as vehicle_model,
    v.vehicle_type,
    fol.created_at,
    coalesce(fol.source, fol.transaction_type) as source,
    coalesce(fol.is_financial_expense, false) as is_financial_expense,
    fol.receipt_media,
    fol.receipt_media as invoice_image,
    fol.rental_id,
    r.rental_id as rental_reference,
    fol.fuel_lines_before,
    fol.fuel_lines_after,
    fol.liters_before,
    fol.liters_after
  from public.fuel_operation_logs fol
  left join public.app_4c3a7a6153_rentals r on r.id = fol.rental_id
  left join public.saharax_0u4w4d_vehicles v on v.id = coalesce(fol.vehicle_id, r.vehicle_id)
  where fol.transaction_type not in ('tank_refill', 'vehicle_refill', 'withdrawal', 'tank_out')
)
select * from refill_rows
union all
select * from withdrawal_rows
union all
select * from operation_log_rows;

comment on view public.fuel_transactions_default_feed is
  'Unified default feed for the All Fuel Transactions page, already ordered and merged at the database layer, with organization context for shared tenancy.';

notify pgrst, 'reload schema';

commit;
