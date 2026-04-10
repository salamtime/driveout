begin;

create extension if not exists pgcrypto;

create table if not exists public.tour_vehicle_snapshots (
  id uuid primary key default gen_random_uuid(),
  tour_group_id text not null,
  booking_row_id uuid null references public.app_4c3a7a6153_rentals(id) on delete set null,
  vehicle_id bigint not null references public.saharax_0u4w4d_vehicles(id) on delete restrict,
  plate_number_snapshot text,
  model_snapshot text,
  start_odometer numeric(12,2),
  end_odometer numeric(12,2),
  start_fuel_level numeric(5,2),
  end_fuel_level numeric(5,2),
  source_fuel_level numeric(5,2),
  start_fuel_liters numeric(10,3),
  end_fuel_liters numeric(10,3),
  fuel_consumed_liters numeric(10,3) not null default 0,
  fuel_surplus_liters numeric(10,3) not null default 0,
  fuel_unit_cost_snapshot numeric(10,2) not null default 0,
  fuel_expense_total numeric(10,2) not null default 0,
  fuel_surplus_value numeric(10,2) not null default 0,
  started_at timestamptz,
  returned_at timestamptz,
  started_by text,
  returned_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_vehicle_snapshots_group_vehicle_unique unique (tour_group_id, vehicle_id)
);

create index if not exists tour_vehicle_snapshots_tour_group_id_idx
  on public.tour_vehicle_snapshots (tour_group_id);

create index if not exists tour_vehicle_snapshots_vehicle_id_idx
  on public.tour_vehicle_snapshots (vehicle_id);

create index if not exists tour_vehicle_snapshots_started_at_idx
  on public.tour_vehicle_snapshots (started_at desc);

create index if not exists tour_vehicle_snapshots_returned_at_idx
  on public.tour_vehicle_snapshots (returned_at desc);

commit;
