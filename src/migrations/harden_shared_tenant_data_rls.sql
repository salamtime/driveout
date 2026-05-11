begin;

create extension if not exists pgcrypto;

create or replace function public.app_has_current_organization_access_text(v_organization_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parsed_organization_id uuid;
begin
  if nullif(btrim(coalesce(v_organization_id, '')), '') is null then
    return false;
  end if;

  begin
    parsed_organization_id := btrim(v_organization_id)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return public.app_has_current_organization_access(parsed_organization_id);
end;
$$;

create or replace function public.app_can_manage_current_organization_text(v_organization_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parsed_organization_id uuid;
begin
  if nullif(btrim(coalesce(v_organization_id, '')), '') is null then
    return false;
  end if;

  begin
    parsed_organization_id := btrim(v_organization_id)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return public.app_can_manage_current_organization(parsed_organization_id);
end;
$$;

grant execute on function public.app_has_current_organization_access_text(text) to authenticated, service_role;
grant execute on function public.app_can_manage_current_organization_text(text) to authenticated, service_role;

do $$
begin
  if to_regclass('public.app_organizations') is not null then
    execute 'alter table public.app_organizations enable row level security';
    execute 'alter table public.app_organizations force row level security';

    execute 'drop policy if exists "shared tenant organizations select" on public.app_organizations';
    execute 'drop policy if exists "shared tenant organizations insert" on public.app_organizations';
    execute 'drop policy if exists "shared tenant organizations update" on public.app_organizations';
    execute 'drop policy if exists "shared tenant organizations delete" on public.app_organizations';

    execute $policy$
      create policy "shared tenant organizations select"
      on public.app_organizations
      for select
      to authenticated
      using (public.app_has_current_organization_access(id))
    $policy$;

    execute $policy$
      create policy "shared tenant organizations insert"
      on public.app_organizations
      for insert
      to authenticated
      with check (public.app_is_platform_admin())
    $policy$;

    execute $policy$
      create policy "shared tenant organizations update"
      on public.app_organizations
      for update
      to authenticated
      using (public.app_can_manage_current_organization(id))
      with check (public.app_can_manage_current_organization(id))
    $policy$;

    execute $policy$
      create policy "shared tenant organizations delete"
      on public.app_organizations
      for delete
      to authenticated
      using (public.app_is_platform_admin())
    $policy$;
  end if;

  if to_regclass('public.app_organization_members') is not null then
    execute 'alter table public.app_organization_members enable row level security';
    execute 'alter table public.app_organization_members force row level security';

    execute 'drop policy if exists "shared tenant organization members select" on public.app_organization_members';
    execute 'drop policy if exists "shared tenant organization members insert" on public.app_organization_members';
    execute 'drop policy if exists "shared tenant organization members update" on public.app_organization_members';
    execute 'drop policy if exists "shared tenant organization members delete" on public.app_organization_members';

    execute $policy$
      create policy "shared tenant organization members select"
      on public.app_organization_members
      for select
      to authenticated
      using (public.app_has_current_organization_access(organization_id))
    $policy$;

    execute $policy$
      create policy "shared tenant organization members insert"
      on public.app_organization_members
      for insert
      to authenticated
      with check (public.app_can_manage_current_organization(organization_id))
    $policy$;

    execute $policy$
      create policy "shared tenant organization members update"
      on public.app_organization_members
      for update
      to authenticated
      using (public.app_can_manage_current_organization(organization_id))
      with check (public.app_can_manage_current_organization(organization_id))
    $policy$;

    execute $policy$
      create policy "shared tenant organization members delete"
      on public.app_organization_members
      for delete
      to authenticated
      using (public.app_can_manage_current_organization(organization_id))
    $policy$;
  end if;

  if to_regclass('public.app_b30c02e74da644baad4668e3587d86b1_users') is not null then
    execute 'alter table public.app_b30c02e74da644baad4668e3587d86b1_users enable row level security';
    execute 'alter table public.app_b30c02e74da644baad4668e3587d86b1_users force row level security';

    execute 'drop policy if exists "shared tenant users select" on public.app_b30c02e74da644baad4668e3587d86b1_users';
    execute 'drop policy if exists "shared tenant users insert" on public.app_b30c02e74da644baad4668e3587d86b1_users';
    execute 'drop policy if exists "shared tenant users update" on public.app_b30c02e74da644baad4668e3587d86b1_users';
    execute 'drop policy if exists "shared tenant users delete" on public.app_b30c02e74da644baad4668e3587d86b1_users';

    execute $policy$
      create policy "shared tenant users select"
      on public.app_b30c02e74da644baad4668e3587d86b1_users
      for select
      to authenticated
      using (
        auth.uid() = id
        or public.app_has_current_organization_access(primary_organization_id)
      )
    $policy$;

    execute $policy$
      create policy "shared tenant users insert"
      on public.app_b30c02e74da644baad4668e3587d86b1_users
      for insert
      to authenticated
      with check (
        auth.uid() = id
        or public.app_is_platform_admin()
        or public.app_can_manage_current_organization(primary_organization_id)
      )
    $policy$;

    execute $policy$
      create policy "shared tenant users update"
      on public.app_b30c02e74da644baad4668e3587d86b1_users
      for update
      to authenticated
      using (
        auth.uid() = id
        or public.app_can_manage_current_organization(primary_organization_id)
      )
      with check (
        auth.uid() = id
        or public.app_can_manage_current_organization(primary_organization_id)
      )
    $policy$;

    execute $policy$
      create policy "shared tenant users delete"
      on public.app_b30c02e74da644baad4668e3587d86b1_users
      for delete
      to authenticated
      using (public.app_is_platform_admin())
    $policy$;
  end if;

  if to_regclass('public.app_b30c02e74da644baad4668e3587d86b1_user_module_access') is not null then
    execute 'alter table public.app_b30c02e74da644baad4668e3587d86b1_user_module_access enable row level security';
    execute 'alter table public.app_b30c02e74da644baad4668e3587d86b1_user_module_access force row level security';

    execute 'drop policy if exists "shared tenant user module access select" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access';
    execute 'drop policy if exists "shared tenant user module access insert" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access';
    execute 'drop policy if exists "shared tenant user module access update" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access';
    execute 'drop policy if exists "shared tenant user module access delete" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access';

    execute $policy$
      create policy "shared tenant user module access select"
      on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
      for select
      to authenticated
      using (
        auth.uid() = user_id
        or public.app_has_current_organization_access(organization_id)
      )
    $policy$;

    execute $policy$
      create policy "shared tenant user module access insert"
      on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
      for insert
      to authenticated
      with check (public.app_can_manage_current_organization(organization_id))
    $policy$;

    execute $policy$
      create policy "shared tenant user module access update"
      on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
      for update
      to authenticated
      using (public.app_can_manage_current_organization(organization_id))
      with check (public.app_can_manage_current_organization(organization_id))
    $policy$;

    execute $policy$
      create policy "shared tenant user module access delete"
      on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
      for delete
      to authenticated
      using (public.app_can_manage_current_organization(organization_id))
    $policy$;
  end if;
end $$;

do $$
declare
  current_table text;
  policy_record record;
  tenant_tables_with_uuid_org text[] := array[
    'saharax_0u4w4d_vehicles',
    'app_4c3a7a6153_customers',
    'app_4c3a7a6153_rentals',
    'rental_extensions',
    'app_4c3a7a6153_base_prices',
    'pricing_tiers',
    'app_4c3a7a6153_rental_km_packages',
    'app_4c3a7a6153_transport_fees',
    'app_4c3a7a6153_team_tasks',
    'app_4c3a7a6153_task_comments',
    'app_4c3a7a6153_task_notifications',
    'app_4c3a7a6153_vehicle_reports',
    'app_687f658e98_maintenance',
    'app_687f658e98_maintenance_parts',
    'app_687f658e98_tour_packages',
    'app_687f658e98_tour_package_model_prices',
    'app_687f658e98_tour_bookings',
    'tour_vehicle_snapshots',
    'saharax_0u4w4d_inventory_items',
    'saharax_0u4w4d_inventory_movements',
    'saharax_0u4w4d_inventory_purchases',
    'saharax_0u4w4d_inventory_purchase_lines',
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
  tenant_tables_with_text_org text[] := array[
    'app_4c3a7a6153_receive_funds_entries',
    'finance_expenses'
  ];
begin
  foreach current_table in array tenant_tables_with_uuid_org loop
    if to_regclass('public.' || current_table) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = current_table
        and column_name = 'organization_id'
        and udt_name = 'uuid'
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', current_table);
    execute format('alter table public.%I force row level security', current_table);

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = current_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, current_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.app_has_current_organization_access(organization_id))',
      'shared tenant select ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.app_has_current_organization_access(organization_id))',
      'shared tenant insert ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.app_has_current_organization_access(organization_id)) with check (public.app_has_current_organization_access(organization_id))',
      'shared tenant update ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.app_has_current_organization_access(organization_id))',
      'shared tenant delete ' || current_table,
      current_table
    );
  end loop;

  foreach current_table in array tenant_tables_with_text_org loop
    if to_regclass('public.' || current_table) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = current_table
        and column_name = 'organization_id'
        and data_type in ('text', 'character varying')
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', current_table);
    execute format('alter table public.%I force row level security', current_table);

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = current_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, current_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.app_has_current_organization_access_text(organization_id))',
      'shared tenant select ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.app_has_current_organization_access_text(organization_id))',
      'shared tenant insert ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.app_has_current_organization_access_text(organization_id)) with check (public.app_has_current_organization_access_text(organization_id))',
      'shared tenant update ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.app_has_current_organization_access_text(organization_id))',
      'shared tenant delete ' || current_table,
      current_table
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
