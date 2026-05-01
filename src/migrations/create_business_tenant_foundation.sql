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
    check (organization_type in ('platform','business_tenant')),
  constraint app_organizations_status_check
    check (organization_status in ('active','inactive','suspended'))
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
    check (member_role in ('org_owner','org_admin','operations_manager','agent','guide','mechanic','finance','viewer','org_member')),
  constraint app_organization_members_status_check
    check (membership_status in ('active','invited','suspended'))
);

create index if not exists idx_app_organizations_owner_user_id
  on public.app_organizations (owner_user_id);

create index if not exists idx_app_organizations_platform
  on public.app_organizations (is_platform_organization, organization_status);

create index if not exists idx_app_organization_members_user_id
  on public.app_organization_members (user_id);

create index if not exists idx_app_organization_members_org_id
  on public.app_organization_members (organization_id);

do $$
declare
  platform_org_id uuid;
  table_name text;
  platform_tables text[] := array[
    'saharax_0u4w4d_vehicles',
    'app_4c3a7a6153_customers',
    'app_4c3a7a6153_rentals',
    'app_4c3a7a6153_base_prices',
    'app_4c3a7a6153_rental_km_packages',
    'app_4c3a7a6153_transport_fees',
    'app_4c3a7a6153_team_tasks',
    'app_4c3a7a6153_task_comments',
    'app_4c3a7a6153_task_notifications',
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

  alter table public.app_b30c02e74da644baad4668e3587d86b1_users
    add column if not exists primary_organization_id uuid references public.app_organizations(id) on delete set null;

  create index if not exists idx_app_users_primary_organization_id
    on public.app_b30c02e74da644baad4668e3587d86b1_users (primary_organization_id);

  update public.app_b30c02e74da644baad4668e3587d86b1_users
  set primary_organization_id = platform_org_id
  where primary_organization_id is null
    and lower(coalesce(role::text, '')) in ('owner','admin','employee','guide');

  insert into public.app_organization_members (
    organization_id,
    user_id,
    member_role,
    membership_status
  )
  select
    platform_org_id,
    u.id,
    case lower(coalesce(u.role::text, ''))
      when 'owner' then 'org_owner'
      when 'admin' then 'org_admin'
      when 'guide' then 'guide'
      else 'operations_manager'
    end,
    'active'
  from public.app_b30c02e74da644baad4668e3587d86b1_users u
  where lower(coalesce(u.role::text, '')) in ('owner','admin','employee','guide')
  on conflict (organization_id, user_id) do nothing;

  insert into public.app_organization_members (
    organization_id,
    user_id,
    member_role,
    membership_status
  )
  select
    tenant_org.id,
    u.id,
    'org_owner',
    'active'
  from public.app_b30c02e74da644baad4668e3587d86b1_users u
  join lateral (
    insert into public.app_organizations (
      name,
      slug,
      owner_user_id,
      organization_type,
      organization_status,
      is_platform_organization
    )
    values (
      coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.email), ''), 'Business Workspace'),
      left(
        regexp_replace(
          lower(coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.email), ''), 'business-workspace')),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        42
      ) || '-' || left(replace(u.id::text, '-', ''), 8),
      u.id,
      'business_tenant',
      'active',
      false
    )
    on conflict (slug) do update
    set updated_at = now()
    returning id
  ) as tenant_org on true
  where lower(coalesce(u.role::text, '')) = 'business_owner'
    and coalesce(u.primary_organization_id, platform_org_id) = platform_org_id
  on conflict (organization_id, user_id) do nothing;

  update public.app_b30c02e74da644baad4668e3587d86b1_users u
  set primary_organization_id = membership.organization_id
  from (
    select m.user_id, m.organization_id
    from public.app_organization_members m
    join public.app_organizations o on o.id = m.organization_id
    where m.member_role = 'org_owner'
      and o.is_platform_organization = false
  ) membership
  where membership.user_id = u.id
    and lower(coalesce(u.role::text, '')) = 'business_owner';

  delete from public.app_organization_members m
  using public.app_organizations o, public.app_b30c02e74da644baad4668e3587d86b1_users u
  where m.organization_id = o.id
    and m.user_id = u.id
    and o.is_platform_organization = true
    and lower(coalesce(u.role::text, '')) = 'business_owner';

  foreach table_name in array platform_tables loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'alter table public.%I add column if not exists organization_id uuid references public.app_organizations(id) on delete set null',
        table_name
      );
      execute format(
        'create index if not exists %I on public.%I (organization_id)',
        'idx_' || table_name || '_organization_id',
        table_name
      );
      execute format(
        'update public.%I set organization_id = $1 where organization_id is null',
        table_name
      ) using platform_org_id;
    end if;
  end loop;

  if to_regclass('public.app_b30c02e74da644baad4668e3587d86b1_user_module_access') is not null then
    update public.app_b30c02e74da644baad4668e3587d86b1_user_module_access uma
    set organization_id = coalesce(u.primary_organization_id, platform_org_id)
    from public.app_b30c02e74da644baad4668e3587d86b1_users u
    where uma.user_id = u.id
      and uma.organization_id is distinct from coalesce(u.primary_organization_id, platform_org_id);
  end if;
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

notify pgrst, 'reload schema';
