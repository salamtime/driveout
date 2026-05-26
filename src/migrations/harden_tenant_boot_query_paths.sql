create index if not exists idx_fuel_refills_tank_refill_date
  on public.fuel_refills (refill_date desc)
  where vehicle_id is null;

create index if not exists idx_fuel_refills_vehicle_refill_vehicle_date
  on public.fuel_refills (vehicle_id, refill_date desc)
  where vehicle_id is not null;

create index if not exists idx_rentals_start_date
  on public.app_4c3a7a6153_rentals (rental_start_date);

create index if not exists idx_rentals_start_date_status
  on public.app_4c3a7a6153_rentals (rental_start_date, rental_status);

create index if not exists idx_rentals_status_vehicle
  on public.app_4c3a7a6153_rentals (rental_status, vehicle_id);
