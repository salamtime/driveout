begin;

create extension if not exists pgcrypto;

create or replace function public.app_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admin_accounts admin_accounts
    where admin_accounts.auth_user_id = auth.uid()
      and admin_accounts.access_enabled = true
      and admin_accounts.platform_role in ('platform_owner', 'platform_admin')
  );
$$;

create or replace function public.app_has_current_organization_access(v_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    v_organization_id is not null
    and (
      public.app_is_platform_admin()
      or (
        v_organization_id = public.app_current_organization_id()
        and (
          exists (
            select 1
            from public.app_b30c02e74da644baad4668e3587d86b1_users users
            where users.id = auth.uid()
              and users.primary_organization_id = v_organization_id
          )
          or exists (
            select 1
            from public.app_organization_members members
            where members.user_id = auth.uid()
              and members.organization_id = v_organization_id
              and members.membership_status = 'active'
          )
        )
      )
    );
$$;

create or replace function public.app_can_manage_current_organization(v_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    v_organization_id is not null
    and (
      public.app_is_platform_admin()
      or (
        v_organization_id = public.app_current_organization_id()
        and exists (
          select 1
          from public.app_organization_members members
          where members.user_id = auth.uid()
            and members.organization_id = v_organization_id
            and members.membership_status = 'active'
            and members.member_role in ('org_owner', 'org_admin', 'operations_manager')
        )
      )
    );
$$;

grant execute on function public.app_is_platform_admin() to authenticated, service_role;
grant execute on function public.app_has_current_organization_access(uuid) to authenticated, service_role;
grant execute on function public.app_can_manage_current_organization(uuid) to authenticated, service_role;

alter table public.app_organizations enable row level security;
alter table public.app_organization_members enable row level security;
alter table public.app_b30c02e74da644baad4668e3587d86b1_users enable row level security;
alter table public.app_b30c02e74da644baad4668e3587d86b1_user_module_access enable row level security;

drop policy if exists "shared tenant organizations select" on public.app_organizations;
drop policy if exists "shared tenant organizations insert" on public.app_organizations;
drop policy if exists "shared tenant organizations update" on public.app_organizations;
drop policy if exists "shared tenant organizations delete" on public.app_organizations;

create policy "shared tenant organizations select"
on public.app_organizations
for select
to authenticated
using (public.app_has_current_organization_access(id));

create policy "shared tenant organizations insert"
on public.app_organizations
for insert
to authenticated
with check (public.app_is_platform_admin());

create policy "shared tenant organizations update"
on public.app_organizations
for update
to authenticated
using (public.app_can_manage_current_organization(id))
with check (public.app_can_manage_current_organization(id));

create policy "shared tenant organizations delete"
on public.app_organizations
for delete
to authenticated
using (public.app_is_platform_admin());

drop policy if exists "shared tenant organization members select" on public.app_organization_members;
drop policy if exists "shared tenant organization members insert" on public.app_organization_members;
drop policy if exists "shared tenant organization members update" on public.app_organization_members;
drop policy if exists "shared tenant organization members delete" on public.app_organization_members;

create policy "shared tenant organization members select"
on public.app_organization_members
for select
to authenticated
using (public.app_has_current_organization_access(organization_id));

create policy "shared tenant organization members insert"
on public.app_organization_members
for insert
to authenticated
with check (public.app_can_manage_current_organization(organization_id));

create policy "shared tenant organization members update"
on public.app_organization_members
for update
to authenticated
using (public.app_can_manage_current_organization(organization_id))
with check (public.app_can_manage_current_organization(organization_id));

create policy "shared tenant organization members delete"
on public.app_organization_members
for delete
to authenticated
using (public.app_can_manage_current_organization(organization_id));

drop policy if exists "shared tenant users select" on public.app_b30c02e74da644baad4668e3587d86b1_users;
drop policy if exists "shared tenant users insert" on public.app_b30c02e74da644baad4668e3587d86b1_users;
drop policy if exists "shared tenant users update" on public.app_b30c02e74da644baad4668e3587d86b1_users;
drop policy if exists "shared tenant users delete" on public.app_b30c02e74da644baad4668e3587d86b1_users;

create policy "shared tenant users select"
on public.app_b30c02e74da644baad4668e3587d86b1_users
for select
to authenticated
using (
  auth.uid() = id
  or public.app_has_current_organization_access(primary_organization_id)
);

create policy "shared tenant users insert"
on public.app_b30c02e74da644baad4668e3587d86b1_users
for insert
to authenticated
with check (
  auth.uid() = id
  or public.app_is_platform_admin()
  or public.app_can_manage_current_organization(primary_organization_id)
);

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
);

create policy "shared tenant users delete"
on public.app_b30c02e74da644baad4668e3587d86b1_users
for delete
to authenticated
using (public.app_is_platform_admin());

drop policy if exists "shared tenant user module access select" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access;
drop policy if exists "shared tenant user module access insert" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access;
drop policy if exists "shared tenant user module access update" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access;
drop policy if exists "shared tenant user module access delete" on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access;

create policy "shared tenant user module access select"
on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
for select
to authenticated
using (
  auth.uid() = user_id
  or public.app_has_current_organization_access(organization_id)
);

create policy "shared tenant user module access insert"
on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
for insert
to authenticated
with check (public.app_can_manage_current_organization(organization_id));

create policy "shared tenant user module access update"
on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
for update
to authenticated
using (public.app_can_manage_current_organization(organization_id))
with check (public.app_can_manage_current_organization(organization_id));

create policy "shared tenant user module access delete"
on public.app_b30c02e74da644baad4668e3587d86b1_user_module_access
for delete
to authenticated
using (public.app_can_manage_current_organization(organization_id));

do $$
declare
  table_name text;
  policy_record record;
  tenant_workspace_tables text[] := array[
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
    'fuel_operation_logs'
  ];
begin
  foreach table_name in array tenant_workspace_tables loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.app_has_current_organization_access(organization_id))',
      'shared tenant select ' || table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.app_has_current_organization_access(organization_id))',
      'shared tenant insert ' || table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.app_has_current_organization_access(organization_id)) with check (public.app_has_current_organization_access(organization_id))',
      'shared tenant update ' || table_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.app_has_current_organization_access(organization_id))',
      'shared tenant delete ' || table_name,
      table_name
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
