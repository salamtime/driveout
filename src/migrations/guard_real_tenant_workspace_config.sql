-- Guard tenant activation so placeholder workspace pool values cannot become
-- an active tenant workspace. This keeps provisioning dynamic and explicit:
-- a tenant can become active only after real Supabase project values exist.

begin;

update public.platform_tenants
set
  tenant_status = 'failed',
  provisioning_error = 'Tenant workspace configuration is placeholder and must be replaced with real Supabase project values before activation.',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'invalid_workspace_config_detected_at', now(),
    'invalid_workspace_config_reason', 'placeholder_tenant_workspace_config'
  ),
  updated_at = now()
where tenant_status = 'active'
  and (
    tenant_project_ref is null
    or tenant_project_ref ~* '(placeholder|test2_project_ref)'
    or tenant_api_url is null
    or tenant_api_url !~* '^https://[a-z0-9-]+\.supabase\.co/?$'
    or tenant_api_url ~* '(placeholder|test2_project_ref)'
    or tenant_anon_key is null
    or tenant_anon_key in ('test2_anon_key')
    or tenant_anon_key ~* 'placeholder'
  );

update public.platform_tenant_workspace_pool
set
  status = 'failed',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'invalid_workspace_config_detected_at', now(),
    'invalid_workspace_config_reason', 'placeholder_tenant_workspace_config'
  ),
  updated_at = now()
where status in ('available', 'assigned')
  and (
    tenant_project_ref is null
    or tenant_project_ref ~* '(placeholder|test2_project_ref)'
    or tenant_api_url is null
    or tenant_api_url !~* '^https://[a-z0-9-]+\.supabase\.co/?$'
    or tenant_api_url ~* '(placeholder|test2_project_ref)'
    or tenant_anon_key is null
    or tenant_anon_key in ('test2_anon_key')
    or tenant_anon_key ~* 'placeholder'
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_tenants_active_real_config_check'
      and conrelid = 'public.platform_tenants'::regclass
  ) then
    alter table public.platform_tenants
      add constraint platform_tenants_active_real_config_check
      check (
        tenant_status <> 'active'
        or (
          tenant_project_ref is not null
          and tenant_project_ref !~* '(placeholder|test2_project_ref)'
          and tenant_api_url is not null
          and tenant_api_url ~* '^https://[a-z0-9-]+\.supabase\.co/?$'
          and tenant_api_url !~* '(placeholder|test2_project_ref)'
          and tenant_anon_key is not null
          and tenant_anon_key <> 'test2_anon_key'
          and tenant_anon_key !~* 'placeholder'
          and tenant_app_url is not null
          and tenant_app_url ~* '^https://[a-z0-9-]+\.driveout\.io/?$'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_tenant_workspace_pool_available_real_config_check'
      and conrelid = 'public.platform_tenant_workspace_pool'::regclass
  ) then
    alter table public.platform_tenant_workspace_pool
      add constraint platform_tenant_workspace_pool_available_real_config_check
      check (
        status not in ('available', 'assigned')
        or (
          tenant_project_ref is not null
          and tenant_project_ref !~* '(placeholder|test2_project_ref)'
          and tenant_api_url is not null
          and tenant_api_url ~* '^https://[a-z0-9-]+\.supabase\.co/?$'
          and tenant_api_url !~* '(placeholder|test2_project_ref)'
          and tenant_anon_key is not null
          and tenant_anon_key <> 'test2_anon_key'
          and tenant_anon_key !~* 'placeholder'
          and tenant_app_url is not null
          and tenant_app_url ~* '^https://[a-z0-9-]+\.driveout\.io/?$'
        )
      );
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
