alter table public.app_4c3a7a6153_rental_km_packages
  add column if not exists fuel_charge_enabled boolean not null default false;
