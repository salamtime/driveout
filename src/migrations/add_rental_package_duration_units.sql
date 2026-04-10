alter table public.app_4c3a7a6153_rental_km_packages
  add column if not exists duration_units numeric(6,2);

update public.app_4c3a7a6153_rental_km_packages
set duration_units = 1
where duration_units is null;

alter table public.app_4c3a7a6153_rental_km_packages
  alter column duration_units set not null;

alter table public.app_4c3a7a6153_rental_km_packages
  drop constraint if exists rental_km_packages_duration_units_positive;

alter table public.app_4c3a7a6153_rental_km_packages
  add constraint rental_km_packages_duration_units_positive
  check (duration_units > 0);

comment on column public.app_4c3a7a6153_rental_km_packages.duration_units
  is 'Source-of-truth duration units for this fixed rental package. Hourly packages can use 0.5 for 30 minutes.';
