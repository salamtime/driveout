alter table public.app_4c3a7a6153_rentals
  alter column quantity_hours type numeric(6,2)
  using quantity_hours::numeric;

comment on column public.app_4c3a7a6153_rentals.quantity_hours
  is 'Rental duration in hours. Supports fractional packages such as 0.5 for 30 minutes.';
