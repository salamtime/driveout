create table if not exists public.rental_events (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null,
  event_type text not null,
  actor text not null check (actor in ('renter', 'owner', 'system', 'admin')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists rental_events_rental_created_idx
  on public.rental_events(rental_id, created_at desc);

create index if not exists rental_events_type_created_idx
  on public.rental_events(event_type, created_at desc);

notify pgrst, 'reload schema';
