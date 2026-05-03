begin;

alter table public.app_4c3a7a6153_rentals
  add column if not exists start_engine_hours numeric(12,2),
  add column if not exists end_engine_hours numeric(12,2);

commit;
