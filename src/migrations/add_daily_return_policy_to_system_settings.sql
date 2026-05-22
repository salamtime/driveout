alter table public.saharax_0u4w4d_settings
add column if not exists daily_return_fixed_time text default '14:00',
add column if not exists daily_late_return_hourly_penalty_mad numeric(12,2) default 200,
add column if not exists daily_late_return_full_day_threshold_hours integer default 4;

update public.saharax_0u4w4d_settings
set
  daily_return_fixed_time = case
    when coalesce(daily_return_fixed_time, '') ~ '^\d{2}:\d{2}$' then daily_return_fixed_time
    else '14:00'
  end,
  daily_late_return_hourly_penalty_mad = greatest(0, coalesce(daily_late_return_hourly_penalty_mad, 200)),
  daily_late_return_full_day_threshold_hours = greatest(1, coalesce(daily_late_return_full_day_threshold_hours, 4))
where id = 1;
