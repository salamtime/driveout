-- Marketplace owner flow compatibility patch
-- Run this if the marketplace tables were created before the latest column set.

do $$
declare
  listing_status_type text;
  review_status_type text;
begin
  select data_type, udt_name
  into listing_status_type, review_status_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'app_marketplace_listings'
    and column_name = 'listing_status';

  if listing_status_type = 'USER-DEFINED' and review_status_type is not null then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = review_status_type
        and e.enumlabel = 'pending_review'
    ) then
      execute format('alter type %I add value if not exists %L', review_status_type, 'pending_review');
    end if;

    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = review_status_type
        and e.enumlabel = 'approved'
    ) then
      execute format('alter type %I add value if not exists %L', review_status_type, 'approved');
    end if;

    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = review_status_type
        and e.enumlabel = 'live'
    ) then
      execute format('alter type %I add value if not exists %L', review_status_type, 'live');
    end if;

    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = review_status_type
        and e.enumlabel = 'rejected'
    ) then
      execute format('alter type %I add value if not exists %L', review_status_type, 'rejected');
    end if;

    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = review_status_type
        and e.enumlabel = 'unpublished'
    ) then
      execute format('alter type %I add value if not exists %L', review_status_type, 'unpublished');
    end if;
  end if;
end $$;

alter table public.app_vehicle_public_profiles
  add column if not exists vehicle_ref_id text,
  add column if not exists owner_type text not null default 'individual_owner',
  add column if not exists owner_display_name text,
  add column if not exists category_code text not null default 'atv',
  add column if not exists plate_number text,
  add column if not exists city_name text not null default 'Tangier',
  add column if not exists country_name text not null default 'Morocco',
  add column if not exists area_name text,
  add column if not exists short_description text,
  add column if not exists full_description text,
  add column if not exists seats integer,
  add column if not exists engine_cc integer,
  add column if not exists transmission text,
  add column if not exists fuel_policy text,
  add column if not exists deposit_amount numeric(12,2),
  add column if not exists mileage_limit_km integer,
  add column if not exists extra_km_rate numeric(12,2),
  add column if not exists availability jsonb not null default '{}'::jsonb,
  add column if not exists specs jsonb not null default '{}'::jsonb,
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists cover_image_url text,
  add column if not exists marketplace_visible boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.app_vehicle_public_profiles
  alter column vehicle_ref_id drop not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_vehicle_public_profiles'
      and column_name = 'inventory_source'
  ) then
    alter table public.app_vehicle_public_profiles
      add column inventory_source text;
  end if;
end $$;

alter table public.app_vehicle_public_profiles
  alter column inventory_source drop default,
  alter column inventory_source drop not null;

alter table public.app_marketplace_listings
  add column if not exists owner_type text not null default 'individual_owner',
  add column if not exists listing_status text not null default 'draft',
  add column if not exists review_status text not null default 'not_submitted',
  add column if not exists booking_mode text not null default 'request',
  add column if not exists title text,
  add column if not exists currency_code text not null default 'MAD',
  add column if not exists hourly_price_amount numeric(12,2),
  add column if not exists daily_price_amount numeric(12,2),
  add column if not exists weekly_price_amount numeric(12,2),
  add column if not exists deposit_amount numeric(12,2),
  add column if not exists included_km integer,
  add column if not exists extra_km_rate numeric(12,2),
  add column if not exists pricing jsonb not null default '{}'::jsonb,
  add column if not exists admin_notes text,
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists unpublished_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.app_booking_requests
  add column if not exists listing_id uuid references public.app_marketplace_listings(id) on delete cascade,
  add column if not exists vehicle_public_profile_id uuid references public.app_vehicle_public_profiles(id) on delete set null,
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists customer_id uuid references auth.users(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists requested_start_at timestamptz,
  add column if not exists requested_end_at timestamptz,
  add column if not exists rental_type text not null default 'hourly',
  add column if not exists duration numeric(10,2),
  add column if not exists request_status text not null default 'pending',
  add column if not exists customer_message text,
  add column if not exists owner_response text,
  add column if not exists counter_offer jsonb not null default '{}'::jsonb,
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists negotiated_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

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

notify pgrst, 'reload schema';
