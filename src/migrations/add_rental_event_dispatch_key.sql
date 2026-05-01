alter table if exists public.rental_events
  add column if not exists dispatch_key text;

create unique index if not exists rental_events_dispatch_key_unique_idx
  on public.rental_events(rental_id, event_type, dispatch_key)
  where dispatch_key is not null and btrim(dispatch_key) <> '';

notify pgrst, 'reload schema';
