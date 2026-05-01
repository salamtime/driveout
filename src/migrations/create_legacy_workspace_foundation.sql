begin;

create extension if not exists pgcrypto;

create table if not exists public.app_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  organization_type text not null default 'business_tenant',
  organization_status text not null default 'active',
  is_platform_organization boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_organizations_type_check
    check (organization_type in ('platform', 'business_tenant')),
  constraint app_organizations_status_check
    check (organization_status in ('active', 'inactive', 'suspended'))
);

create table if not exists public.app_organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.app_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'org_member',
  membership_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  constraint app_organization_members_role_check
    check (member_role in ('org_owner', 'org_admin', 'operations_manager', 'agent', 'guide', 'mechanic', 'finance', 'viewer', 'org_member')),
  constraint app_organization_members_status_check
    check (membership_status in ('active', 'invited', 'suspended'))
);

create index if not exists idx_app_organizations_owner_user_id
  on public.app_organizations (owner_user_id);

create index if not exists idx_app_organizations_platform
  on public.app_organizations (is_platform_organization, organization_status);

create index if not exists idx_app_organization_members_user_id
  on public.app_organization_members (user_id);

create index if not exists idx_app_organization_members_org_id
  on public.app_organization_members (organization_id);

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  add column if not exists primary_organization_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_primary_organization_id_fkey'
      and conrelid = 'public.app_b30c02e74da644baad4668e3587d86b1_users'::regclass
  ) then
    alter table public.app_b30c02e74da644baad4668e3587d86b1_users
      add constraint app_users_primary_organization_id_fkey
      foreign key (primary_organization_id)
      references public.app_organizations(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_app_users_primary_organization_id
  on public.app_b30c02e74da644baad4668e3587d86b1_users (primary_organization_id);

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
set updated_at = now();

do $$
declare
  table_name text;
  tables_with_org text[] := array[
    'saharax_0u4w4d_vehicles',
    'app_4c3a7a6153_customers',
    'app_4c3a7a6153_rentals',
    'app_4c3a7a6153_base_prices',
    'app_4c3a7a6153_rental_km_packages',
    'app_4c3a7a6153_transport_fees',
    'app_4c3a7a6153_team_tasks',
    'app_4c3a7a6153_task_comments',
    'app_4c3a7a6153_task_notifications',
    'app_4c3a7a6153_vehicle_reports',
    'app_687f658e98_maintenance',
    'app_687f658e98_maintenance_parts',
    'app_687f658e98_tour_packages',
    'app_687f658e98_tour_bookings',
    'saharax_0u4w4d_inventory_items',
    'saharax_0u4w4d_inventory_movements',
    'saharax_0u4w4d_inventory_purchases',
    'saharax_0u4w4d_inventory_purchase_lines',
    'app_b30c02e74da644baad4668e3587d86b1_user_module_access'
  ];
  constraint_name text;
begin
  foreach table_name in array tables_with_org loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists organization_id uuid',
      table_name
    );

    constraint_name := table_name || '_organization_id_fkey';

    if not exists (
      select 1
      from pg_constraint
      where conname = constraint_name
        and conrelid = to_regclass('public.' || table_name)
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
end $$;

create or replace function public.app_current_organization_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    (
      select u.primary_organization_id
      from public.app_b30c02e74da644baad4668e3587d86b1_users u
      where u.id = auth.uid()
    ),
    (
      select m.organization_id
      from public.app_organization_members m
      where m.user_id = auth.uid()
        and m.membership_status = 'active'
      order by m.created_at asc
      limit 1
    )
  );
$$;

commit;

notify pgrst, 'reload schema';
