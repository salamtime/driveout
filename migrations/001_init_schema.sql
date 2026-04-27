create extension if not exists "uuid-ossp";

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'request_status'
      and n.nspname = 'public'
  ) then
    create type public.request_status as enum (
      'draft',
      'sent',
      'pre_approved',
      'declined',
      'expired',
      'confirmed'
    );
  end if;
end
$$;

create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_requests (
  id uuid primary key default uuid_generate_v4(),
  renter_id uuid not null references public.users(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  status public.request_status not null default 'draft',
  requested_start_at timestamptz,
  requested_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rentals (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null unique references public.marketplace_requests(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  renter_id uuid not null references public.users(id) on delete restrict,
  owner_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'draft',
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.threads (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.marketplace_requests(id) on delete cascade,
  renter_id uuid not null references public.users(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active',
  legacy_unlinked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete restrict,
  type text not null default 'message',
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_threads_request on public.threads(request_id);
create index if not exists idx_messages_thread on public.messages(thread_id);
create index if not exists idx_requests_renter on public.marketplace_requests(renter_id);
create index if not exists idx_requests_owner on public.marketplace_requests(owner_id);

drop trigger if exists update_users_updated_at on public.users;
create trigger update_users_updated_at
before update on public.users
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_vehicles_updated_at on public.vehicles;
create trigger update_vehicles_updated_at
before update on public.vehicles
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_marketplace_requests_updated_at on public.marketplace_requests;
create trigger update_marketplace_requests_updated_at
before update on public.marketplace_requests
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_rentals_updated_at on public.rentals;
create trigger update_rentals_updated_at
before update on public.rentals
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_threads_updated_at on public.threads;
create trigger update_threads_updated_at
before update on public.threads
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_messages_updated_at on public.messages;
create trigger update_messages_updated_at
before update on public.messages
for each row
execute function public.update_updated_at_column();
