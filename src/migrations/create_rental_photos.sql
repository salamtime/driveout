create table if not exists public.rental_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  vehicle_id uuid,
  phase text not null check (phase in ('handoff', 'return')),
  kind text default 'photo',
  bucket text,
  storage_path text,
  public_url text not null,
  thumbnail_url text,
  mime_type text,
  original_filename text,
  file_size bigint default 0,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists rental_photos_request_phase_idx
  on public.rental_photos(request_id, phase, created_at desc);

create index if not exists rental_photos_vehicle_phase_idx
  on public.rental_photos(vehicle_id, phase, created_at desc);

notify pgrst, 'reload schema';
