-- Marketplace owner flow foundation
-- Run in Supabase SQL editor.
-- This creates the owner vehicle profiles, marketplace listings, booking requests,
-- and optional request message thread table used by the owner marketplace MVP.

create extension if not exists pgcrypto;

create or replace function public.app_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_vehicle_public_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_type text not null default 'individual_owner',
  owner_display_name text,
  brand_name text not null,
  model_name text not null,
  category_code text not null default 'atv',
  year integer,
  plate_number text,
  city_name text not null default 'Tangier',
  country_name text not null default 'Morocco',
  area_name text,
  short_description text,
  full_description text,
  seats integer,
  engine_cc integer,
  transmission text,
  fuel_policy text,
  deposit_amount numeric(12,2),
  mileage_limit_km integer,
  extra_km_rate numeric(12,2),
  availability jsonb not null default '{}'::jsonb,
  specs jsonb not null default '{}'::jsonb,
  media jsonb not null default '[]'::jsonb,
  cover_image_url text,
  marketplace_visible boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_vehicle_public_profiles_owner_type_check
    check (owner_type in ('individual_owner', 'operator', 'owner'))
);

create table if not exists public.app_marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  vehicle_public_profile_id uuid not null references public.app_vehicle_public_profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_type text not null default 'individual_owner',
  listing_status text not null default 'draft',
  review_status text not null default 'not_submitted',
  booking_mode text not null default 'request',
  title text,
  currency_code text not null default 'MAD',
  hourly_price_amount numeric(12,2),
  daily_price_amount numeric(12,2),
  weekly_price_amount numeric(12,2),
  deposit_amount numeric(12,2),
  included_km integer,
  extra_km_rate numeric(12,2),
  pricing jsonb not null default '{}'::jsonb,
  admin_notes text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_marketplace_listings_owner_type_check
    check (owner_type in ('individual_owner', 'operator', 'owner')),
  constraint app_marketplace_listings_status_check
    check (listing_status in ('draft', 'pending_review', 'approved', 'live', 'rejected', 'unpublished')),
  constraint app_marketplace_listings_review_check
    check (review_status in ('not_submitted', 'pending', 'approved', 'rejected')),
  constraint app_marketplace_listings_booking_mode_check
    check (booking_mode in ('request', 'instant'))
);

create table if not exists public.app_booking_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.app_marketplace_listings(id) on delete cascade,
  vehicle_public_profile_id uuid references public.app_vehicle_public_profiles(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  requested_start_at timestamptz not null,
  requested_end_at timestamptz not null,
  rental_type text not null default 'hourly',
  duration numeric(10,2),
  request_status text not null default 'pending',
  customer_message text,
  owner_response text,
  counter_offer jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  declined_at timestamptz,
  negotiated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_booking_requests_status_check
    check (request_status in ('pending', 'accepted', 'declined', 'negotiated', 'cancelled', 'expired', 'closed')),
  constraint app_booking_requests_rental_type_check
    check (rental_type in ('hourly', 'daily', 'weekly'))
);

create table if not exists public.app_booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.app_booking_requests(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_type text not null,
  message_body text not null,
  message_kind text not null default 'message',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_booking_messages_sender_check
    check (sender_type in ('customer', 'owner', 'admin', 'system'))
);

create index if not exists idx_vehicle_public_profiles_owner
  on public.app_vehicle_public_profiles(owner_id);
create index if not exists idx_vehicle_public_profiles_public
  on public.app_vehicle_public_profiles(marketplace_visible, is_active, city_name);

create index if not exists idx_marketplace_listings_owner
  on public.app_marketplace_listings(owner_id);
create index if not exists idx_marketplace_listings_public
  on public.app_marketplace_listings(listing_status, vehicle_public_profile_id);
create index if not exists idx_marketplace_listings_review
  on public.app_marketplace_listings(review_status, submitted_at);

create index if not exists idx_booking_requests_owner
  on public.app_booking_requests(owner_id, request_status, created_at desc);
create index if not exists idx_booking_requests_customer
  on public.app_booking_requests(customer_id, created_at desc);
create index if not exists idx_booking_requests_listing
  on public.app_booking_requests(listing_id, created_at desc);

create index if not exists idx_booking_messages_request
  on public.app_booking_messages(booking_request_id, created_at);

drop trigger if exists trg_app_vehicle_public_profiles_updated_at on public.app_vehicle_public_profiles;
create trigger trg_app_vehicle_public_profiles_updated_at
before update on public.app_vehicle_public_profiles
for each row execute function public.app_touch_updated_at();

drop trigger if exists trg_app_marketplace_listings_updated_at on public.app_marketplace_listings;
create trigger trg_app_marketplace_listings_updated_at
before update on public.app_marketplace_listings
for each row execute function public.app_touch_updated_at();

drop trigger if exists trg_app_booking_requests_updated_at on public.app_booking_requests;
create trigger trg_app_booking_requests_updated_at
before update on public.app_booking_requests
for each row execute function public.app_touch_updated_at();

alter table public.app_vehicle_public_profiles enable row level security;
alter table public.app_marketplace_listings enable row level security;
alter table public.app_booking_requests enable row level security;
alter table public.app_booking_messages enable row level security;

grant select on public.app_vehicle_public_profiles to anon, authenticated, service_role;
grant insert, update, delete on public.app_vehicle_public_profiles to authenticated, service_role;

grant select on public.app_marketplace_listings to anon, authenticated, service_role;
grant insert, update, delete on public.app_marketplace_listings to authenticated, service_role;

grant select on public.app_booking_requests to authenticated, service_role;
grant insert on public.app_booking_requests to anon, authenticated, service_role;
grant update on public.app_booking_requests to authenticated, service_role;

grant select, insert on public.app_booking_messages to authenticated, service_role;

drop policy if exists "Public read live vehicle profiles" on public.app_vehicle_public_profiles;
create policy "Public read live vehicle profiles"
on public.app_vehicle_public_profiles
for select
using (
  is_active = true
  and marketplace_visible = true
  and exists (
    select 1
    from public.app_marketplace_listings listings
    where listings.vehicle_public_profile_id = app_vehicle_public_profiles.id
      and listings.listing_status = 'live'
  )
);

drop policy if exists "Owners manage own vehicle profiles" on public.app_vehicle_public_profiles;
create policy "Owners manage own vehicle profiles"
on public.app_vehicle_public_profiles
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Public read live marketplace listings" on public.app_marketplace_listings;
create policy "Public read live marketplace listings"
on public.app_marketplace_listings
for select
using (listing_status = 'live');

drop policy if exists "Owners manage own marketplace listings" on public.app_marketplace_listings;
create policy "Owners manage own marketplace listings"
on public.app_marketplace_listings
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Public create marketplace booking requests" on public.app_booking_requests;
create policy "Public create marketplace booking requests"
on public.app_booking_requests
for insert
with check (
  customer_id is null
  and exists (
    select 1
    from public.app_marketplace_listings listings
    where listings.id = app_booking_requests.listing_id
      and listings.owner_id = app_booking_requests.owner_id
      and listings.listing_status = 'live'
  )
);

drop policy if exists "Customers create own booking requests" on public.app_booking_requests;
create policy "Customers create own booking requests"
on public.app_booking_requests
for insert
to authenticated
with check (
  auth.uid() = customer_id
  and exists (
    select 1
    from public.app_marketplace_listings listings
    where listings.id = app_booking_requests.listing_id
      and listings.owner_id = app_booking_requests.owner_id
      and listings.listing_status = 'live'
  )
);

drop policy if exists "Request participants read booking requests" on public.app_booking_requests;
create policy "Request participants read booking requests"
on public.app_booking_requests
for select
using (auth.uid() = owner_id or auth.uid() = customer_id);

drop policy if exists "Owners update own booking requests" on public.app_booking_requests;
create policy "Owners update own booking requests"
on public.app_booking_requests
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Request participants read messages" on public.app_booking_messages;
create policy "Request participants read messages"
on public.app_booking_messages
for select
using (
  exists (
    select 1
    from public.app_booking_requests requests
    where requests.id = app_booking_messages.booking_request_id
      and (requests.owner_id = auth.uid() or requests.customer_id = auth.uid())
  )
);

drop policy if exists "Request participants create messages" on public.app_booking_messages;
create policy "Request participants create messages"
on public.app_booking_messages
for insert
with check (
  exists (
    select 1
    from public.app_booking_requests requests
    where requests.id = app_booking_messages.booking_request_id
      and (requests.owner_id = auth.uid() or requests.customer_id = auth.uid())
  )
);
