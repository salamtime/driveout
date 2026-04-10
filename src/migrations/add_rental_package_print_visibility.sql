alter table public.app_4c3a7a6153_rental_km_packages
  add column if not exists show_on_print boolean not null default false;

create index if not exists idx_rental_km_packages_print_visibility
  on public.app_4c3a7a6153_rental_km_packages (vehicle_model_id, show_on_print, is_active);
