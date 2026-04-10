-- Allow trusted server-side API routes to read and manage the platform tenant registry.
-- Browser clients still go through the authenticated API handlers and role checks.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.platform_business_accounts to service_role;
grant select, insert, update, delete on table public.platform_business_subscriptions to service_role;
grant select, insert, update, delete on table public.platform_tenants to service_role;
grant select, insert, update, delete on table public.platform_tenant_provisioning_jobs to service_role;
grant select, insert, update, delete on table public.platform_tenant_audit_log to service_role;

notify pgrst, 'reload schema';
