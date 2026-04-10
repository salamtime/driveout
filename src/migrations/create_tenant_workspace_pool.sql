-- Pool of pre-created isolated tenant workspaces.
-- The provisioning driver claims one available workspace and then activates the tenant.

create table if not exists public.platform_tenant_workspace_pool (
  id uuid primary key default gen_random_uuid(),
  workspace_name text,
  tenant_project_ref text not null unique,
  tenant_app_url text not null unique,
  tenant_api_url text not null,
  tenant_anon_key text not null,
  tenant_service_role_secret_ref text,
  tenant_database_name text,
  schema_version text not null default 'v1',
  status text not null default 'available',
  assigned_tenant_id uuid references public.platform_tenants(id) on delete set null,
  assigned_business_account_id uuid references public.platform_business_accounts(id) on delete set null,
  assigned_job_id uuid references public.platform_tenant_provisioning_jobs(id) on delete set null,
  assigned_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_tenant_workspace_pool_status_check
    check (status in ('available', 'assigned', 'failed', 'disabled'))
);

create index if not exists idx_platform_tenant_workspace_pool_status
  on public.platform_tenant_workspace_pool (status, created_at);

create index if not exists idx_platform_tenant_workspace_pool_assignment
  on public.platform_tenant_workspace_pool (assigned_tenant_id, assigned_job_id);

alter table public.platform_tenant_workspace_pool enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.platform_tenant_workspace_pool to service_role;

notify pgrst, 'reload schema';
