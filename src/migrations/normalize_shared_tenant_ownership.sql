begin;

create extension if not exists pgcrypto;

do $$
declare
  platform_org_id uuid;
  single_tenant_org_id uuid;
  tenant_org_count integer := 0;
  fallback_table text;
begin
  select id
  into platform_org_id
  from public.app_organizations
  where slug = 'driveout-platform'
  limit 1;

  create temporary table tmp_shared_tenant_org_map on commit drop as
  select
    pt.id as tenant_id,
    pt.business_account_id,
    pt.owner_user_id,
    pt.tenant_slug,
    org.id as organization_id,
    org.slug as organization_slug
  from public.platform_tenants pt
  join public.app_organizations org
    on org.owner_user_id = pt.owner_user_id
   and coalesce(org.is_platform_organization, false) = false;

  create index if not exists tmp_shared_tenant_org_map_owner_idx
    on tmp_shared_tenant_org_map (owner_user_id);

  select count(*), min(organization_id)
  into tenant_org_count, single_tenant_org_id
  from tmp_shared_tenant_org_map;

  update public.platform_tenants pt
  set metadata = coalesce(pt.metadata, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'tenancy_mode', coalesce(pt.metadata->>'tenancy_mode', 'shared'),
      'organization_id', map.organization_id,
      'organization_slug', map.organization_slug
    )
  )
  from tmp_shared_tenant_org_map map
  where map.tenant_id = pt.id;

  update public.app_b30c02e74da644baad4668e3587d86b1_users users
  set
    tenant_id = map.tenant_id,
    primary_organization_id = coalesce(
      case
        when lower(coalesce(users.role::text, '')) = 'business_owner' then map.organization_id
        else users.primary_organization_id
      end,
      map.organization_id
    )
  from tmp_shared_tenant_org_map map
  where map.owner_user_id = users.id
    and (
      users.tenant_id is distinct from map.tenant_id
      or users.primary_organization_id is null
      or (users.primary_organization_id = platform_org_id and lower(coalesce(users.role::text, '')) = 'business_owner')
    );

  if to_regclass('public.app_b30c02e74da644baad4668e3587d86b1_user_module_access') is not null then
    update public.app_b30c02e74da644baad4668e3587d86b1_user_module_access access
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where access.user_id = users.id
      and access.organization_id is distinct from users.primary_organization_id
      and users.primary_organization_id is not null;
  end if;

  if to_regclass('public.app_687f658e98_maintenance') is not null
     and to_regclass('public.saharax_0u4w4d_vehicles') is not null then
    update public.app_687f658e98_maintenance maintenance
    set organization_id = vehicles.organization_id
    from public.saharax_0u4w4d_vehicles vehicles
    where maintenance.vehicle_id = vehicles.id
      and maintenance.organization_id = platform_org_id
      and vehicles.organization_id is not null
      and vehicles.organization_id <> platform_org_id;
  end if;

  if to_regclass('public.app_4c3a7a6153_vehicle_reports') is not null then
    if to_regclass('public.app_4c3a7a6153_rentals') is not null then
      update public.app_4c3a7a6153_vehicle_reports reports
      set organization_id = rentals.organization_id
      from public.app_4c3a7a6153_rentals rentals
      where reports.rental_id = rentals.id
        and reports.organization_id = platform_org_id
        and rentals.organization_id is not null
        and rentals.organization_id <> platform_org_id;
    end if;

    if to_regclass('public.saharax_0u4w4d_vehicles') is not null then
      update public.app_4c3a7a6153_vehicle_reports reports
      set organization_id = vehicles.organization_id
      from public.saharax_0u4w4d_vehicles vehicles
      where reports.vehicle_id = vehicles.id
        and reports.organization_id = platform_org_id
        and vehicles.organization_id is not null
        and vehicles.organization_id <> platform_org_id;
    end if;

    if to_regclass('public.app_687f658e98_maintenance') is not null then
      update public.app_4c3a7a6153_vehicle_reports reports
      set organization_id = maintenance.organization_id
      from public.app_687f658e98_maintenance maintenance
      where reports.maintenance_id = maintenance.id
        and reports.organization_id = platform_org_id
        and maintenance.organization_id is not null
        and maintenance.organization_id <> platform_org_id;
    end if;
  end if;

  if to_regclass('public.app_687f658e98_maintenance_parts') is not null then
    if to_regclass('public.app_687f658e98_maintenance') is not null then
      update public.app_687f658e98_maintenance_parts parts
      set organization_id = maintenance.organization_id
      from public.app_687f658e98_maintenance maintenance
      where parts.maintenance_id = maintenance.id
        and parts.organization_id = platform_org_id
        and maintenance.organization_id is not null
        and maintenance.organization_id <> platform_org_id;
    end if;

    if to_regclass('public.saharax_0u4w4d_inventory_items') is not null then
      update public.app_687f658e98_maintenance_parts parts
      set organization_id = items.organization_id
      from public.saharax_0u4w4d_inventory_items items
      where parts.item_id = items.id
        and parts.organization_id = platform_org_id
        and items.organization_id is not null
        and items.organization_id <> platform_org_id;
    end if;
  end if;

  if to_regclass('public.saharax_0u4w4d_inventory_movements') is not null
     and to_regclass('public.saharax_0u4w4d_inventory_items') is not null then
    update public.saharax_0u4w4d_inventory_movements movements
    set organization_id = items.organization_id
    from public.saharax_0u4w4d_inventory_items items
    where movements.item_id = items.id
      and movements.organization_id = platform_org_id
      and items.organization_id is not null
      and items.organization_id <> platform_org_id;
  end if;

  if to_regclass('public.saharax_0u4w4d_inventory_purchase_lines') is not null then
    if to_regclass('public.saharax_0u4w4d_inventory_purchases') is not null then
      update public.saharax_0u4w4d_inventory_purchase_lines lines
      set organization_id = purchases.organization_id
      from public.saharax_0u4w4d_inventory_purchases purchases
      where lines.purchase_id = purchases.id
        and lines.organization_id = platform_org_id
        and purchases.organization_id is not null
        and purchases.organization_id <> platform_org_id;
    end if;

    if to_regclass('public.saharax_0u4w4d_inventory_items') is not null then
      update public.saharax_0u4w4d_inventory_purchase_lines lines
      set organization_id = items.organization_id
      from public.saharax_0u4w4d_inventory_items items
      where lines.item_id = items.id
        and lines.organization_id = platform_org_id
        and items.organization_id is not null
        and items.organization_id <> platform_org_id;
    end if;
  end if;

  if to_regclass('public.saharax_0u4w4d_inventory_purchases') is not null
     and to_regclass('public.saharax_0u4w4d_inventory_purchase_lines') is not null then
    update public.saharax_0u4w4d_inventory_purchases purchases
    set organization_id = lines.organization_id
    from (
      select purchase_id, min(organization_id) as organization_id
      from public.saharax_0u4w4d_inventory_purchase_lines
      where organization_id is not null
      group by purchase_id
    ) lines
    where purchases.id = lines.purchase_id
      and purchases.organization_id = platform_org_id
      and lines.organization_id <> platform_org_id;
  end if;

  if to_regclass('public.app_4c3a7a6153_team_tasks') is not null then
    if to_regclass('public.app_4c3a7a6153_rentals') is not null then
      update public.app_4c3a7a6153_team_tasks tasks
      set organization_id = rentals.organization_id
      from public.app_4c3a7a6153_rentals rentals
      where tasks.linked_entity_type = 'rental'
        and tasks.linked_entity_id = rentals.id::text
        and tasks.organization_id = platform_org_id
        and rentals.organization_id is not null
        and rentals.organization_id <> platform_org_id;
    end if;

    if to_regclass('public.app_687f658e98_maintenance') is not null then
      update public.app_4c3a7a6153_team_tasks tasks
      set organization_id = maintenance.organization_id
      from public.app_687f658e98_maintenance maintenance
      where tasks.linked_entity_type = 'maintenance'
        and tasks.linked_entity_id = maintenance.id::text
        and tasks.organization_id = platform_org_id
        and maintenance.organization_id is not null
        and maintenance.organization_id <> platform_org_id;
    end if;

    if to_regclass('public.saharax_0u4w4d_vehicles') is not null then
      update public.app_4c3a7a6153_team_tasks tasks
      set organization_id = vehicles.organization_id
      from public.saharax_0u4w4d_vehicles vehicles
      where tasks.linked_entity_type = 'vehicle'
        and tasks.linked_entity_id = vehicles.id::text
        and tasks.organization_id = platform_org_id
        and vehicles.organization_id is not null
        and vehicles.organization_id <> platform_org_id;
    end if;

    update public.app_4c3a7a6153_team_tasks tasks
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where coalesce(tasks.created_by, tasks.assigned_user, tasks.claimed_by, tasks.completed_by) = users.id
      and tasks.organization_id = platform_org_id
      and users.primary_organization_id is not null
      and users.primary_organization_id <> platform_org_id;
  end if;

  if to_regclass('public.app_4c3a7a6153_task_comments') is not null
     and to_regclass('public.app_4c3a7a6153_team_tasks') is not null then
    update public.app_4c3a7a6153_task_comments comments
    set organization_id = tasks.organization_id
    from public.app_4c3a7a6153_team_tasks tasks
    where comments.task_id = tasks.id
      and comments.organization_id = platform_org_id
      and tasks.organization_id is not null
      and tasks.organization_id <> platform_org_id;
  end if;

  if to_regclass('public.app_4c3a7a6153_task_notifications') is not null then
    if to_regclass('public.app_4c3a7a6153_team_tasks') is not null then
      update public.app_4c3a7a6153_task_notifications notifications
      set organization_id = tasks.organization_id
      from public.app_4c3a7a6153_team_tasks tasks
      where notifications.task_id = tasks.id
        and notifications.organization_id = platform_org_id
        and tasks.organization_id is not null
        and tasks.organization_id <> platform_org_id;
    end if;

    update public.app_4c3a7a6153_task_notifications notifications
    set organization_id = users.primary_organization_id
    from public.app_b30c02e74da644baad4668e3587d86b1_users users
    where notifications.user_id = users.id
      and notifications.organization_id = platform_org_id
      and users.primary_organization_id is not null
      and users.primary_organization_id <> platform_org_id;
  end if;

  if to_regclass('public.app_687f658e98_tour_bookings') is not null
     and to_regclass('public.saharax_0u4w4d_vehicles') is not null then
    update public.app_687f658e98_tour_bookings bookings
    set organization_id = vehicles.organization_id
    from public.saharax_0u4w4d_vehicles vehicles
    where bookings.vehicle_id = vehicles.id
      and bookings.organization_id = platform_org_id
      and vehicles.organization_id is not null
      and vehicles.organization_id <> platform_org_id;
  end if;

  if tenant_org_count = 1 and single_tenant_org_id is not null then
    foreach fallback_table in array array[
      'saharax_0u4w4d_vehicles',
      'app_4c3a7a6153_customers',
      'app_4c3a7a6153_base_prices',
      'app_4c3a7a6153_rental_km_packages',
      'app_4c3a7a6153_transport_fees',
      'app_4c3a7a6153_rentals',
      'app_687f658e98_tour_packages',
      'saharax_0u4w4d_inventory_items',
      'fuel_tank',
      'pricing_tiers',
      'rental_extensions',
      'app_687f658e98_tour_package_model_prices',
      'tour_vehicle_snapshots',
      'fuel_refills',
      'vehicle_fuel_refills',
      'fuel_withdrawals',
      'vehicle_fuel_state',
      'fuel_operation_logs',
      'app_687f658e98_maintenance',
      'saharax_0u4w4d_inventory_movements',
      'saharax_0u4w4d_inventory_purchases',
      'saharax_0u4w4d_inventory_purchase_lines',
      'app_4c3a7a6153_team_tasks',
      'app_4c3a7a6153_task_comments',
      'app_4c3a7a6153_task_notifications',
      'app_4c3a7a6153_vehicle_reports',
      'app_687f658e98_maintenance_parts',
      'app_687f658e98_tour_bookings',
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
    ]
    loop
      if to_regclass(format('public.%s', fallback_table)) is not null then
        execute format(
          'update public.%I set organization_id = $1 where organization_id = $2',
          fallback_table
        )
        using single_tenant_org_id, platform_org_id;
      end if;
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
