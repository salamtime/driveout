alter table public.saharax_0u4w4d_settings
add column if not exists rental_grace_period_minutes numeric(10,2) default 60,
add column if not exists rental_soft_lock_minutes numeric(10,2) default 45,
add column if not exists extra_hour_threshold_minutes numeric(10,2) default 25;

update public.saharax_0u4w4d_settings
set
  rental_grace_period_minutes = greatest(0, least(120, coalesce(rental_grace_period_minutes, 60))),
  rental_soft_lock_minutes = greatest(0, least(120, coalesce(rental_soft_lock_minutes, 45))),
  extra_hour_threshold_minutes = greatest(0, least(120, coalesce(extra_hour_threshold_minutes, 25)))
where id = 1;
