begin;

create or replace function public.app_has_current_organization_access(v_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_org as (
    select public.app_current_organization_id() as organization_id
  ),
  current_user_has_org_access as (
    select exists (
      select 1
      from public.app_b30c02e74da644baad4668e3587d86b1_users users
      join current_org co on co.organization_id = users.primary_organization_id
      where users.id = auth.uid()
    ) or exists (
      select 1
      from public.app_organization_members members
      join current_org co on co.organization_id = members.organization_id
      where members.user_id = auth.uid()
        and members.membership_status = 'active'
    ) as has_access
  ),
  current_org_flags as (
    select co.organization_id, coalesce(orgs.is_platform_organization, false) as is_platform
    from current_org co
    left join public.app_organizations orgs on orgs.id = co.organization_id
  )
  select
    public.app_is_platform_admin()
    or (
      coalesce((select has_access from current_user_has_org_access), false)
      and (
        (
          coalesce((select is_platform from current_org_flags), false) = true
          and (
            v_organization_id is null
            or v_organization_id = (select organization_id from current_org_flags)
          )
        )
        or (
          v_organization_id is not null
          and v_organization_id = (select organization_id from current_org_flags)
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
  with current_org as (
    select public.app_current_organization_id() as organization_id
  ),
  current_user_can_manage as (
    select exists (
      select 1
      from public.app_organization_members members
      join current_org co on co.organization_id = members.organization_id
      where members.user_id = auth.uid()
        and members.membership_status = 'active'
        and members.member_role in ('org_owner', 'org_admin', 'operations_manager')
    ) as can_manage
  ),
  current_org_flags as (
    select co.organization_id, coalesce(orgs.is_platform_organization, false) as is_platform
    from current_org co
    left join public.app_organizations orgs on orgs.id = co.organization_id
  )
  select
    public.app_is_platform_admin()
    or (
      coalesce((select can_manage from current_user_can_manage), false)
      and (
        (
          coalesce((select is_platform from current_org_flags), false) = true
          and (
            v_organization_id is null
            or v_organization_id = (select organization_id from current_org_flags)
          )
        )
        or (
          v_organization_id is not null
          and v_organization_id = (select organization_id from current_org_flags)
        )
      )
    );
$$;

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
    return public.app_has_current_organization_access(null::uuid);
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
    return public.app_can_manage_current_organization(null::uuid);
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

grant execute on function public.app_has_current_organization_access(uuid) to authenticated, service_role;
grant execute on function public.app_can_manage_current_organization(uuid) to authenticated, service_role;
grant execute on function public.app_has_current_organization_access_text(text) to authenticated, service_role;
grant execute on function public.app_can_manage_current_organization_text(text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
