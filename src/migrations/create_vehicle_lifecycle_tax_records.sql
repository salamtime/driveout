begin;

alter table public.saharax_0u4w4d_vehicles
  add column if not exists registration_date date,
  add column if not exists sold_date date,
  add column if not exists sale_price_mad numeric(10,2),
  add column if not exists sold_buyer_name text,
  add column if not exists sale_proof_url text,
  add column if not exists sale_proof_name text,
  add column if not exists sale_notes text;

create table if not exists public.saharax_0u4w4d_vehicle_annual_taxes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id integer not null references public.saharax_0u4w4d_vehicles(id) on delete cascade,
  tax_year integer not null,
  amount_mad numeric(10,2) not null default 0,
  payment_date date,
  valid_from date,
  valid_until date,
  proof_url text,
  proof_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_annual_taxes_vehicle_year_idx
  on public.saharax_0u4w4d_vehicle_annual_taxes(vehicle_id, tax_year);

create index if not exists vehicle_annual_taxes_vehicle_id_idx
  on public.saharax_0u4w4d_vehicle_annual_taxes(vehicle_id);

alter table public.saharax_0u4w4d_vehicle_annual_taxes enable row level security;

grant select, insert, update, delete on public.saharax_0u4w4d_vehicle_annual_taxes to authenticated;

drop policy if exists vehicle_annual_taxes_select_authenticated on public.saharax_0u4w4d_vehicle_annual_taxes;
drop policy if exists vehicle_annual_taxes_insert_authenticated on public.saharax_0u4w4d_vehicle_annual_taxes;
drop policy if exists vehicle_annual_taxes_update_authenticated on public.saharax_0u4w4d_vehicle_annual_taxes;
drop policy if exists vehicle_annual_taxes_delete_authenticated on public.saharax_0u4w4d_vehicle_annual_taxes;

create policy vehicle_annual_taxes_select_authenticated
  on public.saharax_0u4w4d_vehicle_annual_taxes
  for select
  to authenticated
  using (true);

create policy vehicle_annual_taxes_insert_authenticated
  on public.saharax_0u4w4d_vehicle_annual_taxes
  for insert
  to authenticated
  with check (true);

create policy vehicle_annual_taxes_update_authenticated
  on public.saharax_0u4w4d_vehicle_annual_taxes
  for update
  to authenticated
  using (true)
  with check (true);

create policy vehicle_annual_taxes_delete_authenticated
  on public.saharax_0u4w4d_vehicle_annual_taxes
  for delete
  to authenticated
  using (true);

commit;
