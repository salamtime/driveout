begin;

alter table public.app_4c3a7a6153_rentals
  add column if not exists selected_vehicle_id_snapshot bigint,
  add column if not exists selected_vehicle_plate_snapshot text,
  add column if not exists selected_vehicle_model_snapshot text,
  add column if not exists selected_vehicle_selected_by text,
  add column if not exists selected_vehicle_selected_at timestamptz;

create index if not exists rentals_selected_vehicle_id_snapshot_idx
  on public.app_4c3a7a6153_rentals (selected_vehicle_id_snapshot);

create index if not exists rentals_selected_vehicle_selected_by_idx
  on public.app_4c3a7a6153_rentals (selected_vehicle_selected_by);

commit;
