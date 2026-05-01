-- Insert one real isolated tenant workspace into the pool for first-tenant@gmail.com.
-- Replace the placeholder values before running this in Supabase SQL Editor.

insert into public.platform_tenant_workspace_pool (
  workspace_name,
  tenant_project_ref,
  tenant_app_url,
  tenant_api_url,
  tenant_anon_key,
  tenant_service_role_secret_ref,
  tenant_database_name,
  schema_version,
  status,
  metadata
)
values (
  'first-tenant-workspace',
  '<REAL_SUPABASE_PROJECT_REF>',
  'https://first-tenant.driveout.io',
  'https://<REAL_SUPABASE_PROJECT_REF>.supabase.co',
  '<REAL_TENANT_ANON_KEY>',
  null,
  'postgres',
  'v1',
  'available',
  jsonb_build_object(
    'source', 'manual_workspace_pool_insert',
    'intended_owner_email', 'first-tenant@gmail.com',
    'notes', 'Dedicated isolated workspace for first tenant verification'
  )
)
on conflict (tenant_project_ref) do update
set
  workspace_name = excluded.workspace_name,
  tenant_app_url = excluded.tenant_app_url,
  tenant_api_url = excluded.tenant_api_url,
  tenant_anon_key = excluded.tenant_anon_key,
  tenant_service_role_secret_ref = excluded.tenant_service_role_secret_ref,
  tenant_database_name = excluded.tenant_database_name,
  schema_version = excluded.schema_version,
  status = 'available',
  assigned_tenant_id = null,
  assigned_business_account_id = null,
  assigned_job_id = null,
  assigned_at = null,
  metadata = excluded.metadata,
  updated_at = now();

notify pgrst, 'reload schema';
