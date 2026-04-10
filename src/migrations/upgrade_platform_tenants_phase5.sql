alter table public.platform_tenants
  add column if not exists tenant_app_url text;

notify pgrst, 'reload schema';
