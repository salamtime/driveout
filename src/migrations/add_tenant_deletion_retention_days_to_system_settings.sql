alter table public.saharax_0u4w4d_settings
add column if not exists tenant_deletion_retention_days numeric(10,2) default 90;

update public.saharax_0u4w4d_settings
set tenant_deletion_retention_days = greatest(1, least(365, coalesce(tenant_deletion_retention_days, 90)))
where id = 1;
