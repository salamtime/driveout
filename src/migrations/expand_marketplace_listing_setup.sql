-- Expand owner marketplace listings into a full rental product setup model.
-- Safe to run after create_marketplace_owner_flow.sql and moderation migrations.

create extension if not exists pgcrypto;

alter table public.app_vehicle_public_profiles
  add column if not exists fuel_type text,
  add column if not exists vehicle_condition text,
  add column if not exists color text,
  add column if not exists extras jsonb not null default '[]'::jsonb,
  add column if not exists minimum_driver_age integer,
  add column if not exists minimum_license_years integer,
  add column if not exists driver_license_required boolean not null default true,
  add column if not exists accepted_license_classes jsonb not null default '[]'::jsonb,
  add column if not exists late_return_penalty_type text,
  add column if not exists late_return_penalty_amount numeric(12,2),
  add column if not exists cancellation_policy text,
  add column if not exists rules jsonb not null default '{}'::jsonb,
  add column if not exists pickup_location_name text,
  add column if not exists pickup_address text,
  add column if not exists pickup_lat numeric(10,7),
  add column if not exists pickup_lng numeric(10,7),
  add column if not exists delivery_available boolean not null default false,
  add column if not exists delivery_radius_km integer,
  add column if not exists delivery_fee_amount numeric(12,2),
  add column if not exists pickup_notes text,
  add column if not exists dropoff_notes text,
  add column if not exists working_days jsonb not null default '[]'::jsonb,
  add column if not exists working_hours jsonb not null default '{}'::jsonb,
  add column if not exists blocked_dates jsonb not null default '[]'::jsonb,
  add column if not exists advance_notice_hours integer,
  add column if not exists minimum_booking_hours integer,
  add column if not exists maximum_booking_days integer,
  add column if not exists terms_template_key text,
  add column if not exists custom_terms_text text,
  add column if not exists terms_accepted_for_submission boolean not null default false,
  add column if not exists last_maintenance_date date,
  add column if not exists insurance_included boolean,
  add column if not exists insurance_notes text,
  add column if not exists roadside_assistance_included boolean,
  add column if not exists safety_info jsonb not null default '{}'::jsonb,
  add column if not exists verification_notes text;

alter table public.app_marketplace_listings
  add column if not exists monthly_price_amount numeric(12,2),
  add column if not exists seasonal_pricing jsonb not null default '[]'::jsonb;

-- Keep pricing jsonb available as a commercial summary envelope.
update public.app_marketplace_listings
set pricing = jsonb_strip_nulls(
  coalesce(pricing, '{}'::jsonb) ||
  jsonb_build_object(
    'hourly_price_amount', hourly_price_amount,
    'daily_price_amount', daily_price_amount,
    'weekly_price_amount', weekly_price_amount,
    'monthly_price_amount', monthly_price_amount,
    'deposit_amount', deposit_amount,
    'included_km', included_km,
    'extra_km_rate', extra_km_rate,
    'seasonal_pricing', seasonal_pricing
  )
)
where pricing is null
   or pricing = '{}'::jsonb;

-- Helpful checks for cleaner data quality.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_vehicle_public_profiles_minimum_driver_age_check'
  ) then
    alter table public.app_vehicle_public_profiles
      add constraint app_vehicle_public_profiles_minimum_driver_age_check
      check (minimum_driver_age is null or minimum_driver_age >= 16);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_vehicle_public_profiles_delivery_radius_km_check'
  ) then
    alter table public.app_vehicle_public_profiles
      add constraint app_vehicle_public_profiles_delivery_radius_km_check
      check (delivery_radius_km is null or delivery_radius_km >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_vehicle_public_profiles_minimum_booking_hours_check'
  ) then
    alter table public.app_vehicle_public_profiles
      add constraint app_vehicle_public_profiles_minimum_booking_hours_check
      check (minimum_booking_hours is null or minimum_booking_hours >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_vehicle_public_profiles_maximum_booking_days_check'
  ) then
    alter table public.app_vehicle_public_profiles
      add constraint app_vehicle_public_profiles_maximum_booking_days_check
      check (maximum_booking_days is null or maximum_booking_days >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_marketplace_listings_monthly_price_amount_check'
  ) then
    alter table public.app_marketplace_listings
      add constraint app_marketplace_listings_monthly_price_amount_check
      check (monthly_price_amount is null or monthly_price_amount >= 0);
  end if;
end $$;

create index if not exists idx_vehicle_public_profiles_pickup_city
  on public.app_vehicle_public_profiles(city_name, category_code);

create index if not exists idx_vehicle_public_profiles_working_days
  on public.app_vehicle_public_profiles using gin (working_days);

create index if not exists idx_vehicle_public_profiles_blocked_dates
  on public.app_vehicle_public_profiles using gin (blocked_dates);

create index if not exists idx_vehicle_public_profiles_extras
  on public.app_vehicle_public_profiles using gin (extras);

create index if not exists idx_marketplace_listings_seasonal_pricing
  on public.app_marketplace_listings using gin (seasonal_pricing);

grant select on public.app_vehicle_public_profiles to anon, authenticated, service_role;
grant insert, update, delete on public.app_vehicle_public_profiles to authenticated, service_role;

grant select on public.app_marketplace_listings to anon, authenticated, service_role;
grant insert, update, delete on public.app_marketplace_listings to authenticated, service_role;

notify pgrst, 'reload schema';
