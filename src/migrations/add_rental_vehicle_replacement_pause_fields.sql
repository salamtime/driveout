begin;

alter table public.app_4c3a7a6153_rentals
  add column if not exists replacement_pause_started_at timestamptz,
  add column if not exists replacement_pause_reason text,
  add column if not exists replacement_resume_context jsonb,
  add column if not exists replacement_previous_vehicle_id bigint;

create index if not exists idx_rentals_replacement_pause_started_at
  on public.app_4c3a7a6153_rentals (replacement_pause_started_at);

commit;
