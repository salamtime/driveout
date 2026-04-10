begin;

create table if not exists public.saharax_0u4w4d_locations (
  id bigserial primary key,
  name text not null,
  code text,
  address text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saharax_0u4w4d_locations
  add column if not exists code text,
  add column if not exists address text,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_default boolean not null default false,
  add column if not exists display_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists saharax_locations_code_unique
  on public.saharax_0u4w4d_locations (lower(code))
  where code is not null;

create unique index if not exists saharax_locations_single_default
  on public.saharax_0u4w4d_locations (is_default)
  where is_default = true;

insert into public.saharax_0u4w4d_locations (name, code, address, is_active, is_default, display_order)
values
  ('Parking lot', 'PARKING', 'Default parking lot', true, true, 1),
  ('Terrain', 'TERRAIN', 'Terrain return area', true, false, 2)
on conflict do nothing;

alter table public.saharax_0u4w4d_vehicles
  drop constraint if exists saharax_vehicles_location_id_fkey;

alter table public.saharax_0u4w4d_vehicles
  add constraint saharax_vehicles_location_id_fkey
  foreign key (location_id)
  references public.saharax_0u4w4d_locations(id)
  on delete set null;

alter table public.app_4c3a7a6153_rentals
  add column if not exists pickup_location_id bigint,
  add column if not exists return_location_id bigint;

alter table public.app_4c3a7a6153_rentals
  drop constraint if exists rentals_pickup_location_id_fkey;

alter table public.app_4c3a7a6153_rentals
  add constraint rentals_pickup_location_id_fkey
  foreign key (pickup_location_id)
  references public.saharax_0u4w4d_locations(id)
  on delete set null;

alter table public.app_4c3a7a6153_rentals
  drop constraint if exists rentals_return_location_id_fkey;

alter table public.app_4c3a7a6153_rentals
  add constraint rentals_return_location_id_fkey
  foreign key (return_location_id)
  references public.saharax_0u4w4d_locations(id)
  on delete set null;

create index if not exists idx_saharax_vehicles_location_id
  on public.saharax_0u4w4d_vehicles(location_id);

create index if not exists idx_rentals_pickup_location_id
  on public.app_4c3a7a6153_rentals(pickup_location_id);

create index if not exists idx_rentals_return_location_id
  on public.app_4c3a7a6153_rentals(return_location_id);

commit;
