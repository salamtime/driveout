alter table public.saharax_0u4w4d_settings
add column if not exists rental_media_retention_enabled boolean default false,
add column if not exists rental_media_retention_days integer default 30;
