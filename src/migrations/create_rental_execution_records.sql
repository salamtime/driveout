begin;

create table if not exists public.app_4c3a7a6153_rental_execution_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  marketplace_request_id uuid not null references public.app_booking_requests(id) on delete cascade,
  rental_id uuid null references public.app_4c3a7a6153_rentals(id) on delete set null,
  owner_user_id uuid null,
  customer_user_id uuid null,
  vehicle_id bigint null references public.saharax_0u4w4d_vehicles(id) on delete set null,
  execution_stage text not null default 'approved',
  latest_snapshot jsonb not null default '{}'::jsonb,
  handoff_snapshot jsonb not null default '{}'::jsonb,
  return_snapshot jsonb not null default '{}'::jsonb,
  evidence_counts jsonb not null default '{}'::jsonb,
  ready_to_start_at timestamptz null,
  started_at timestamptz null,
  return_pending_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rental_execution_records_request_idx
  on public.app_4c3a7a6153_rental_execution_records (marketplace_request_id);

create index if not exists rental_execution_records_org_idx
  on public.app_4c3a7a6153_rental_execution_records (organization_id);

create index if not exists rental_execution_records_rental_idx
  on public.app_4c3a7a6153_rental_execution_records (rental_id);

create index if not exists rental_execution_records_vehicle_idx
  on public.app_4c3a7a6153_rental_execution_records (vehicle_id);

create index if not exists rental_execution_records_stage_idx
  on public.app_4c3a7a6153_rental_execution_records (execution_stage);

commit;
