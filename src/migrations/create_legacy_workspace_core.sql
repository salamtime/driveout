begin;

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('owner', 'admin', 'employee', 'guide', 'customer', 'business_owner');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_verification_status') then
    create type public.driveout_verification_status as enum ('pending', 'approved', 'rejected', 'needs_info');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_subscription_plan') then
    create type public.driveout_subscription_plan as enum ('free_trial', 'saas', 'saas_web');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_subscription_status') then
    create type public.driveout_subscription_status as enum ('trial', 'active', 'expired', 'cancelled', 'suspended');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_plan_type') then
    create type public.driveout_plan_type as enum ('starter', 'growth', 'pro');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_billing_status') then
    create type public.driveout_billing_status as enum ('none', 'active', 'failed');
  end if;
end $$;

create or replace function public.driveout_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_b30c02e74da644baad4668e3587d86b1_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  avatar_url text,
  role public.user_role not null default 'customer',
  permissions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  user_status text not null default 'active',
  verification_status public.driveout_verification_status not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  subscription_plan public.driveout_subscription_plan,
  subscription_status public.driveout_subscription_status,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  plan_type public.driveout_plan_type not null default 'starter',
  billing_status public.driveout_billing_status not null default 'none',
  suspended_at timestamptz,
  suspension_reason text,
  plan_changed_at timestamptz,
  username text,
  first_name text,
  last_name text,
  address text,
  date_of_birth date,
  emergency_contact text,
  emergency_phone text,
  preferences jsonb not null default '{}'::jsonb,
  staff_id_documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_username_format_check
    check (
      username is null
      or username ~ '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$'
    )
);

create table if not exists public.app_b30c02e74da644baad4668e3587d86b1_user_module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_b30c02e74da644baad4668e3587d86b1_users(id) on delete cascade,
  module_name text not null,
  has_access boolean not null default true,
  organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_name)
);

create table if not exists public.saharax_0u4w4d_vehicle_models (
  id bigserial primary key,
  name text not null,
  model text,
  brand_name text,
  category text,
  fuel_type text,
  transmission text,
  seats integer,
  tank_capacity_liters numeric(10,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saharax_0u4w4d_vehicles (
  id bigserial primary key,
  vehicle_model_id bigint references public.saharax_0u4w4d_vehicle_models(id) on delete set null,
  name text not null,
  model text,
  plate_number text,
  vehicle_type text,
  status text not null default 'available',
  current_odometer integer not null default 0,
  purchase_cost_mad numeric(12,2),
  purchase_date date,
  purchase_supplier text,
  sold_date date,
  sale_price_mad numeric(12,2),
  location_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_4c3a7a6153_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  nationality text,
  city text,
  country text,
  address text,
  date_of_birth date,
  license_number text,
  license_country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_4c3a7a6153_base_prices (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint references public.saharax_0u4w4d_vehicles(id) on delete cascade,
  vehicle_model_id bigint references public.saharax_0u4w4d_vehicle_models(id) on delete cascade,
  vehicle_type text,
  location text default 'Default',
  hourly_price numeric(10,2) not null default 0,
  daily_price numeric(10,2) not null default 0,
  weekly_price numeric(10,2) not null default 0,
  base_price numeric(10,2) not null default 0,
  deposit_amount numeric(10,2) not null default 0,
  dynamic_pricing_enabled boolean not null default false,
  currency text not null default 'MAD',
  effective_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  vehicle_model_id bigint not null references public.saharax_0u4w4d_vehicle_models(id) on delete cascade,
  min_hours integer not null default 1,
  max_hours integer not null default 24,
  calculation_method text not null default 'percentage',
  discount_percentage numeric(10,2) not null default 0,
  price_amount numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_tiers_calculation_method_check
    check (calculation_method in ('percentage', 'fixed', 'base'))
);

create table if not exists public.app_4c3a7a6153_rental_km_packages (
  id uuid primary key default gen_random_uuid(),
  vehicle_model_id bigint references public.saharax_0u4w4d_vehicle_models(id) on delete cascade,
  package_name text not null,
  duration_hours integer,
  duration_units integer,
  included_kilometers integer not null default 0,
  extra_km_rate numeric(10,2) not null default 0,
  package_price numeric(10,2) not null default 0,
  currency text not null default 'MAD',
  is_active boolean not null default true,
  allow_fuel_charge boolean not null default true,
  unlimited_kilometers boolean not null default false,
  show_on_print boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_4c3a7a6153_transport_fees (
  id uuid primary key default gen_random_uuid(),
  from_location text,
  to_location text,
  vehicle_type text,
  fee_amount numeric(10,2) not null default 0,
  currency text not null default 'MAD',
  distance_km numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_4c3a7a6153_rentals (
  id uuid primary key default gen_random_uuid(),
  rental_id text unique,
  linked_display_id text,
  customer_id uuid references public.app_4c3a7a6153_customers(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  vehicle_id bigint references public.saharax_0u4w4d_vehicles(id) on delete set null,
  vehicle_model_id bigint references public.saharax_0u4w4d_vehicle_models(id) on delete set null,
  rental_type text default 'hourly',
  rental_status text default 'draft',
  status text default 'draft',
  payment_status text default 'pending',
  approval_status text,
  pending_total_request numeric(10,2),
  total_amount numeric(10,2) not null default 0,
  deposit_amount numeric(10,2) not null default 0,
  remaining_amount numeric(10,2) not null default 0,
  fuel_charge numeric(10,2) not null default 0,
  overage_charge numeric(10,2) not null default 0,
  fuel_charge_enabled boolean not null default true,
  unit_price numeric(10,2) not null default 0,
  quantity_days integer default 0,
  quantity_hours integer default 0,
  transport_fee numeric(10,2) not null default 0,
  pickup_fee_mad numeric(10,2) not null default 0,
  dropoff_fee_mad numeric(10,2) not null default 0,
  late_fee_amount numeric(10,2) not null default 0,
  late_fee numeric(10,2) not null default 0,
  impound_total numeric(10,2) not null default 0,
  impound_discount numeric(10,2) not null default 0,
  total_extension_price numeric(10,2) not null default 0,
  start_odometer integer,
  end_odometer integer,
  start_fuel_level numeric(10,2),
  end_fuel_level numeric(10,2),
  included_kilometers_applied integer,
  extra_km_rate_applied numeric(10,2),
  use_package_pricing boolean not null default false,
  package_id uuid references public.app_4c3a7a6153_rental_km_packages(id) on delete set null,
  selected_package_id uuid references public.app_4c3a7a6153_rental_km_packages(id) on delete set null,
  rental_start_date timestamptz,
  rental_end_date timestamptz,
  rental_start_time text,
  rental_end_time text,
  actual_end_date timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  rental_completed_at timestamptz,
  next_payment_due timestamptz,
  original_end_date timestamptz,
  pickup_location text,
  return_location text,
  pickup_location_id bigint,
  return_location_id bigint,
  is_impounded boolean not null default false,
  impounded_at timestamptz,
  released_from_impound_at timestamptz,
  signature_url text,
  opening_video_url text,
  contract_signed boolean not null default false,
  damage_deposit numeric(10,2),
  deposit_returned_at timestamptz,
  linked_maintenance_id uuid,
  linked_maintenance_customer_charge_total numeric(10,2) not null default 0,
  linked_maintenance_daily_discount numeric(10,2) not null default 0,
  linked_fuel_expense_total numeric(10,2) not null default 0,
  linked_fuel_consumed_liters numeric(10,3) not null default 0,
  linked_fuel_average_unit_cost numeric(10,2) not null default 0,
  notes text,
  current_extension_id uuid,
  extension_count integer not null default 0,
  total_extended_hours integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_4c3a7a6153_rental_second_drivers (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.app_4c3a7a6153_rentals(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  license_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_687f658e98_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint not null references public.saharax_0u4w4d_vehicles(id) on delete cascade,
  rental_id uuid references public.app_4c3a7a6153_rentals(id) on delete set null,
  maintenance_type text not null default 'Other',
  description text,
  service_date date,
  scheduled_date date,
  completed_date timestamptz,
  next_service_date date,
  status text not null default 'scheduled',
  odometer_reading integer,
  labor_rate_mad numeric(10,2) not null default 0,
  labor_cost_mad numeric(10,2) not null default 0,
  parts_cost_mad numeric(10,2) not null default 0,
  external_cost_mad numeric(10,2) not null default 0,
  tax_mad numeric(10,2) not null default 0,
  technician_name text,
  cost numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_4c3a7a6153_rentals
  drop constraint if exists app_4c3a7a6153_rentals_linked_maintenance_id_fkey;

alter table public.app_4c3a7a6153_rentals
  add constraint app_4c3a7a6153_rentals_linked_maintenance_id_fkey
  foreign key (linked_maintenance_id)
  references public.app_687f658e98_maintenance(id)
  on delete set null;

create table if not exists public.saharax_0u4w4d_inventory_items (
  id integer generated by default as identity primary key,
  sku text,
  name text not null,
  category text,
  unit text,
  stock_quantity numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  unit_cost_mad numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saharax_0u4w4d_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id integer not null references public.saharax_0u4w4d_inventory_items(id) on delete cascade,
  movement_type text not null default 'adjustment',
  quantity numeric(12,2) not null default 0,
  unit_cost_mad numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saharax_0u4w4d_inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_name text,
  purchase_date date not null default current_date,
  total_cost_mad numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saharax_0u4w4d_inventory_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.saharax_0u4w4d_inventory_purchases(id) on delete cascade,
  item_id integer references public.saharax_0u4w4d_inventory_items(id) on delete set null,
  quantity numeric(12,2) not null default 0,
  unit_cost_mad numeric(12,2) not null default 0,
  line_total_mad numeric(12,2) generated always as (quantity * unit_cost_mad) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_tank (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Main Tank',
  capacity numeric(10,2) not null default 500,
  initial_volume numeric(10,2) not null default 0,
  current_volume_liters numeric(10,2) not null default 0,
  low_threshold_liters numeric(10,2) not null default 150,
  location text default 'Main Storage',
  fuel_type text default 'gasoline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_refills (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint references public.saharax_0u4w4d_vehicles(id) on delete set null,
  liters_added numeric(10,2) not null default 0,
  total_cost numeric(10,2) not null default 0,
  unit_price numeric(10,2) not null default 0,
  fuel_type text not null default 'gasoline',
  refill_date timestamptz not null default now(),
  fuel_station text,
  location text,
  odometer_reading integer,
  filled_by text,
  notes text,
  receipt_number text,
  invoice_image jsonb,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_by_name text,
  receipt_media jsonb,
  source text default 'tank_refill',
  is_financial_expense boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_fuel_refills (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint not null references public.saharax_0u4w4d_vehicles(id) on delete cascade,
  refill_date timestamptz not null default now(),
  liters numeric(10,2) not null default 0,
  price_per_liter numeric(10,2) not null default 0,
  total_cost numeric(10,2) not null default 0,
  odometer_km integer,
  invoice_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  refilled_by text,
  invoice_image jsonb,
  fuel_lines_before integer,
  fuel_lines_after integer,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_by_name text,
  receipt_media jsonb,
  source text default 'direct_station',
  is_financial_expense boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_withdrawals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id bigint not null references public.saharax_0u4w4d_vehicles(id) on delete cascade,
  liters_taken numeric(10,2) not null default 0,
  unit_price numeric(10,2) not null default 0,
  total_cost numeric(10,2) not null default 0,
  withdrawal_date timestamptz not null default now(),
  filled_by text,
  odometer_reading integer,
  notes text,
  transaction_type text default 'withdrawal',
  source text default 'tank_transfer',
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_by_name text,
  is_financial_expense boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_fuel_state (
  vehicle_id bigint primary key references public.saharax_0u4w4d_vehicles(id) on delete cascade,
  current_fuel_liters numeric(10,3) not null default 0,
  current_fuel_lines integer not null default 0,
  max_fuel_lines integer not null default 8,
  tank_capacity_liters numeric(10,3) not null default 23,
  last_source text,
  last_transaction_id uuid,
  last_rental_id uuid,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_operation_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null,
  source text,
  tank_id uuid references public.fuel_tank(id) on delete set null,
  vehicle_id bigint references public.saharax_0u4w4d_vehicles(id) on delete set null,
  rental_id uuid references public.app_4c3a7a6153_rentals(id) on delete set null,
  liters numeric(10,3),
  fuel_lines_before integer,
  fuel_lines_after integer,
  liters_before numeric(10,3),
  liters_after numeric(10,3),
  unit_price numeric(10,2),
  total_cost numeric(10,2),
  fuel_type text default 'gasoline',
  fuel_station text,
  location text,
  odometer_reading integer,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  performed_by_name text,
  receipt_media jsonb,
  is_financial_expense boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.driveout_default_owner_permissions()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'Dashboard', true,
    'Fleet', true,
    'Rentals', true,
    'Customers', true,
    'Maintenance', true,
    'Team Tasks', true,
    'Fuel', true,
    'Pricing', true,
    'Inventory', true,
    'Finance', true,
    'Calendar', true,
    'Marketplace', true,
    'Settings', true
  );
$$;

create or replace function public.get_user_effective_permissions(v_user_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  u record;
  base_permissions jsonb := '{}'::jsonb;
begin
  select *
  into u
  from public.app_b30c02e74da644baad4668e3587d86b1_users
  where id = v_user_id;

  if not found then
    return '{}'::jsonb;
  end if;

  base_permissions := coalesce(u.permissions, '{}'::jsonb);

  if lower(coalesce(u.role::text, '')) in ('owner', 'admin', 'business_owner') then
    return public.driveout_default_owner_permissions() || base_permissions;
  end if;

  return base_permissions;
end;
$$;

do $$
declare
  table_name text;
  writable_tables text[] := array[
    'app_b30c02e74da644baad4668e3587d86b1_users',
    'app_b30c02e74da644baad4668e3587d86b1_user_module_access',
    'saharax_0u4w4d_vehicle_models',
    'saharax_0u4w4d_vehicles',
    'app_4c3a7a6153_customers',
    'app_4c3a7a6153_base_prices',
    'pricing_tiers',
    'app_4c3a7a6153_rental_km_packages',
    'app_4c3a7a6153_transport_fees',
    'app_4c3a7a6153_rentals',
    'app_4c3a7a6153_rental_second_drivers',
    'app_687f658e98_maintenance',
    'saharax_0u4w4d_inventory_items',
    'saharax_0u4w4d_inventory_movements',
    'saharax_0u4w4d_inventory_purchases',
    'saharax_0u4w4d_inventory_purchase_lines',
    'fuel_tank',
    'fuel_refills',
    'vehicle_fuel_refills',
    'fuel_withdrawals',
    'vehicle_fuel_state',
    'fuel_operation_logs'
  ];
  public_select_tables text[] := array[
    'saharax_0u4w4d_vehicle_models',
    'saharax_0u4w4d_vehicles',
    'app_4c3a7a6153_base_prices',
    'app_4c3a7a6153_rental_km_packages'
  ];
begin
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function public.get_user_effective_permissions(uuid) to anon, authenticated, service_role;
  grant execute on function public.driveout_default_owner_permissions() to anon, authenticated, service_role;

  foreach table_name in array writable_tables loop
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', table_name);
  end loop;

  foreach table_name in array public_select_tables loop
    execute format('grant select on table public.%I to anon', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
  touch_tables text[] := array[
    'app_b30c02e74da644baad4668e3587d86b1_users',
    'app_b30c02e74da644baad4668e3587d86b1_user_module_access',
    'saharax_0u4w4d_vehicle_models',
    'saharax_0u4w4d_vehicles',
    'app_4c3a7a6153_customers',
    'app_4c3a7a6153_base_prices',
    'pricing_tiers',
    'app_4c3a7a6153_rental_km_packages',
    'app_4c3a7a6153_transport_fees',
    'app_4c3a7a6153_rentals',
    'app_4c3a7a6153_rental_second_drivers',
    'app_687f658e98_maintenance',
    'saharax_0u4w4d_inventory_items',
    'saharax_0u4w4d_inventory_movements',
    'saharax_0u4w4d_inventory_purchases',
    'saharax_0u4w4d_inventory_purchase_lines',
    'fuel_tank',
    'fuel_refills',
    'vehicle_fuel_refills',
    'fuel_withdrawals',
    'vehicle_fuel_state',
    'fuel_operation_logs'
  ];
begin
  foreach table_name in array touch_tables loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.driveout_touch_updated_at()',
      'trg_' || table_name || '_touch_updated_at',
      table_name
    );
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
