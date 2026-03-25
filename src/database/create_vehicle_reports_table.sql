-- Vehicle reports captured during rental inspection / return workflow
-- Apply in Supabase to persist reports centrally instead of the local fallback.

create table if not exists public.app_4c3a7a6153_vehicle_reports (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.app_4c3a7a6153_rentals(id) on delete cascade,
  vehicle_id bigint not null references public.saharax_0u4w4d_vehicles(id) on delete cascade,
  report_type text not null default 'damage',
  severity text not null default 'minor',
  description text,
  affected_areas text[] not null default '{}',
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'reported',
  customer_chargeable boolean not null default false,
  customer_charge_amount numeric(10,2) not null default 0,
  send_to_maintenance boolean not null default true,
  maintenance_id uuid null references public.app_687f658e98_maintenance(id) on delete set null,
  maintenance_cost_total numeric(10,2) not null default 0,
  created_by_user_id uuid null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vehicle_reports_rental_id
  on public.app_4c3a7a6153_vehicle_reports (rental_id);

create index if not exists idx_vehicle_reports_vehicle_id
  on public.app_4c3a7a6153_vehicle_reports (vehicle_id);

create index if not exists idx_vehicle_reports_maintenance_id
  on public.app_4c3a7a6153_vehicle_reports (maintenance_id);
