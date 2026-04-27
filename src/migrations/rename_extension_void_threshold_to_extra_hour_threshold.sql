begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'saharax_0u4w4d_settings'
      and column_name = 'extension_void_threshold_minutes'
  ) then
    execute '
      alter table public.saharax_0u4w4d_settings
      rename column extension_void_threshold_minutes to extra_hour_threshold_minutes
    ';
  end if;
end $$;

alter table public.saharax_0u4w4d_settings
  add column if not exists extra_hour_threshold_minutes numeric(10,2) default 25;

alter table public.saharax_0u4w4d_settings
  alter column extra_hour_threshold_minutes set default 25;

update public.saharax_0u4w4d_settings
set extra_hour_threshold_minutes = greatest(0, least(120, coalesce(extra_hour_threshold_minutes, 25)));

commit;
