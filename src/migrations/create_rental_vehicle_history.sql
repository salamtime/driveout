begin;

create table if not exists public.rental_vehicle_history (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.app_4c3a7a6153_rentals(id) on delete cascade,
  vehicle_id bigint references public.saharax_0u4w4d_vehicles(id) on delete set null,
  plate_number_snapshot text,
  vehicle_name_snapshot text,
  vehicle_model_snapshot text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  replacement_reason text,
  change_note text,
  changed_by text,
  sequence_index integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rental_vehicle_history_rental_sequence_idx
  on public.rental_vehicle_history (rental_id, sequence_index);

create index if not exists rental_vehicle_history_rental_idx
  on public.rental_vehicle_history (rental_id);

create index if not exists rental_vehicle_history_vehicle_idx
  on public.rental_vehicle_history (vehicle_id);

create index if not exists rental_vehicle_history_open_idx
  on public.rental_vehicle_history (rental_id, ended_at);

alter table public.app_2f7bf469b0_rental_media
  add column if not exists rental_vehicle_history_id uuid references public.rental_vehicle_history(id) on delete set null;

create index if not exists rental_media_vehicle_history_idx
  on public.app_2f7bf469b0_rental_media (rental_vehicle_history_id);

commit;
