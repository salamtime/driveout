create extension if not exists pgcrypto;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('user', 'vehicle')),
  entity_id text not null,
  owner_user_id uuid not null,
  verification_type text not null check (
    verification_type in (
      'profile_id',
      'driver_license',
      'vehicle_registration',
      'vehicle_insurance',
      'proof_of_ownership'
    )
  ),
  file_url text not null,
  file_path text,
  file_name text,
  file_mime_type text,
  file_size bigint,
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'suspended', 'expired')
  ),
  expires_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references public.verification_requests(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  actor_user_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_verification_requests_entity
  on public.verification_requests (entity_type, entity_id);

create index if not exists idx_verification_requests_owner
  on public.verification_requests (owner_user_id);

create index if not exists idx_verification_requests_status
  on public.verification_requests (status, created_at desc);

create index if not exists idx_verification_requests_type
  on public.verification_requests (verification_type);

create index if not exists idx_verification_requests_expiry
  on public.verification_requests (expires_at)
  where expires_at is not null;

create index if not exists idx_verification_events_request
  on public.verification_events (verification_request_id, created_at desc);

create or replace function public.set_verification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_verification_requests_updated_at on public.verification_requests;
create trigger trg_verification_requests_updated_at
before update on public.verification_requests
for each row
execute function public.set_verification_updated_at();

alter table public.saharax_0u4w4d_vehicles
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verification_summary jsonb not null default '{}'::jsonb,
  add column if not exists insurance_expires_at timestamptz,
  add column if not exists is_listable boolean not null default false;

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  add column if not exists profile_verification_status text not null default 'pending',
  add column if not exists verification_summary jsonb not null default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-documents',
  'verification-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.verification_requests enable row level security;
alter table public.verification_events enable row level security;

drop policy if exists "Users can view their verification requests" on public.verification_requests;
create policy "Users can view their verification requests"
on public.verification_requests
for select
using (auth.uid() = owner_user_id);

drop policy if exists "Users can create their verification requests" on public.verification_requests;
create policy "Users can create their verification requests"
on public.verification_requests
for insert
with check (auth.uid() = owner_user_id);

drop policy if exists "Users can view their verification events" on public.verification_events;
create policy "Users can view their verification events"
on public.verification_events
for select
using (
  exists (
    select 1
    from public.verification_requests request
    where request.id = verification_events.verification_request_id
      and request.owner_user_id = auth.uid()
  )
);

drop policy if exists "Users can upload their verification files" on storage.objects;
create policy "Users can upload their verification files"
on storage.objects
for insert
with check (
  bucket_id = 'verification-documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "Users can read their verification files" on storage.objects;
create policy "Users can read their verification files"
on storage.objects
for select
using (
  bucket_id = 'verification-documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.verification_requests to service_role;
grant select, insert, update, delete on table public.verification_events to service_role;

notify pgrst, 'reload schema';
