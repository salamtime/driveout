do $$
declare
  platform_org_id uuid;
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

  insert into public.app_organizations (
    name,
    slug,
    owner_user_id,
    organization_type,
    organization_status,
    is_platform_organization
  )
  select
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
  from public.app_b30c02e74da644baad4668e3587d86b1_users u
  where lower(coalesce(u.role::text, '')) = 'business_owner'
    and not exists (
      select 1
      from public.app_organization_members m
      join public.app_organizations o on o.id = m.organization_id
      where m.user_id = u.id
        and o.is_platform_organization = false
    )
  on conflict (slug) do nothing;

  insert into public.app_organization_members (
    organization_id,
    user_id,
    member_role,
    membership_status
  )
  select
    o.id,
    u.id,
    'org_owner',
    'active'
  from public.app_b30c02e74da644baad4668e3587d86b1_users u
  join public.app_organizations o
    on o.owner_user_id = u.id
   and o.is_platform_organization = false
  where lower(coalesce(u.role::text, '')) = 'business_owner'
  on conflict (organization_id, user_id) do nothing;

  update public.app_b30c02e74da644baad4668e3587d86b1_users u
  set primary_organization_id = tenant.organization_id
  from (
    select m.user_id, m.organization_id
    from public.app_organization_members m
    join public.app_organizations o on o.id = m.organization_id
    where o.is_platform_organization = false
      and m.member_role = 'org_owner'
  ) tenant
  where tenant.user_id = u.id
    and lower(coalesce(u.role::text, '')) = 'business_owner';

  delete from public.app_organization_members m
  using public.app_organizations o, public.app_b30c02e74da644baad4668e3587d86b1_users u
  where m.organization_id = o.id
    and m.user_id = u.id
    and o.is_platform_organization = true
    and lower(coalesce(u.role::text, '')) = 'business_owner';
end $$;

notify pgrst, 'reload schema';
