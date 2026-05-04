begin;

alter table if exists public.platform_tenant_provisioning_jobs
  drop constraint if exists platform_tenant_provisioning_jobs_type_check;

alter table if exists public.platform_tenant_provisioning_jobs
  add constraint platform_tenant_provisioning_jobs_type_check
  check (job_type in (
    'create_tenant',
    'seed_schema',
    'retry_seed',
    'suspend_tenant',
    'archive_tenant',
    'schema_plan',
    'schema_upgrade',
    'schema_verify',
    'schema_drift'
  ));

notify pgrst, 'reload schema';

commit;
