create extension if not exists pgcrypto;

create or replace function public.tenant_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tenant_workspace_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null unique,
  tenant_name text not null,
  tenant_slug text not null unique,
  workspace_status text not null default 'active',
  owner_user_id uuid,
  marketplace_distribution_enabled boolean not null default false,
  plan_type text not null default 'starter',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_workspace_metadata_status_check
    check (workspace_status in ('active', 'inactive', 'suspended')),
  constraint tenant_workspace_metadata_plan_type_check
    check (plan_type in ('starter', 'growth', 'pro'))
);

create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  platform_user_id uuid,
  email text not null,
  full_name text,
  phone_number text,
  avatar_url text,
  role text not null default 'org_member',
  access_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint tenant_users_role_check
    check (role in ('org_owner', 'org_admin', 'operations_manager', 'agent', 'guide', 'mechanic', 'finance', 'viewer', 'org_member'))
);

create unique index if not exists idx_tenant_users_platform_user_id
  on public.tenant_users (platform_user_id)
  where platform_user_id is not null;

create unique index if not exists idx_tenant_users_email
  on public.tenant_users (lower(email));

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null references public.tenant_users(id) on delete cascade,
  member_role text not null default 'org_member',
  membership_status text not null default 'active',
  invited_by uuid references public.tenant_users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_user_id),
  constraint tenant_members_role_check
    check (member_role in ('org_owner', 'org_admin', 'operations_manager', 'agent', 'guide', 'mechanic', 'finance', 'viewer', 'org_member')),
  constraint tenant_members_status_check
    check (membership_status in ('active', 'invited', 'suspended'))
);

create table if not exists public.tenant_settings (
  id uuid primary key default gen_random_uuid(),
  branding jsonb not null default '{}'::jsonb,
  locale jsonb not null default '{}'::jsonb,
  rental_defaults jsonb not null default '{}'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  finance_settings jsonb not null default '{}'::jsonb,
  marketplace_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_vehicle_models (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  model_name text not null,
  category_code text,
  fuel_type text,
  transmission text,
  seats integer,
  engine_cc integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_model_id uuid references public.tenant_vehicle_models(id) on delete set null,
  vehicle_code text,
  brand_name text,
  model_name text,
  name text not null,
  plate_number text,
  vin text,
  year integer,
  status text not null default 'available',
  ownership_type text not null default 'owned',
  color text,
  current_odometer integer,
  acquisition_cost numeric(12,2),
  acquisition_date date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_vehicles_status_check
    check (status in ('available', 'rented', 'maintenance', 'inactive', 'archived')),
  constraint tenant_vehicles_ownership_type_check
    check (ownership_type in ('owned', 'leased', 'partner'))
);

create unique index if not exists idx_tenant_vehicles_plate_number
  on public.tenant_vehicles (plate_number)
  where plate_number is not null;

create table if not exists public.tenant_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  nationality text,
  city text,
  country text,
  date_of_birth date,
  license_number text,
  license_country text,
  customer_status text not null default 'active',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_customers_status_check
    check (customer_status in ('active', 'inactive', 'flagged', 'banned'))
);

create index if not exists idx_tenant_customers_email
  on public.tenant_customers (lower(email));

create table if not exists public.tenant_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.tenant_vehicles(id) on delete cascade,
  vehicle_model_id uuid references public.tenant_vehicle_models(id) on delete cascade,
  pricing_scope text not null default 'vehicle',
  currency_code text not null default 'MAD',
  base_hourly_price numeric(12,2),
  base_daily_price numeric(12,2),
  base_weekly_price numeric(12,2),
  deposit_amount numeric(12,2),
  included_km integer,
  extra_km_rate numeric(12,2),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_pricing_rules_scope_check
    check (pricing_scope in ('vehicle', 'vehicle_model', 'global'))
);

create table if not exists public.tenant_rentals (
  id uuid primary key default gen_random_uuid(),
  rental_reference text unique,
  customer_id uuid references public.tenant_customers(id) on delete set null,
  vehicle_id uuid references public.tenant_vehicles(id) on delete set null,
  assigned_to uuid references public.tenant_users(id) on delete set null,
  rental_status text not null default 'draft',
  payment_status text not null default 'pending',
  start_at timestamptz,
  end_at timestamptz,
  pickup_location text,
  return_location text,
  total_amount numeric(12,2),
  deposit_amount numeric(12,2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_rentals_status_check
    check (rental_status in ('draft', 'pending', 'confirmed', 'active', 'completed', 'cancelled')),
  constraint tenant_rentals_payment_status_check
    check (payment_status in ('pending', 'partial', 'paid', 'refunded', 'failed'))
);

create index if not exists idx_tenant_rentals_customer_id
  on public.tenant_rentals (customer_id);

create index if not exists idx_tenant_rentals_vehicle_id
  on public.tenant_rentals (vehicle_id);

create table if not exists public.tenant_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_status text not null default 'open',
  priority text not null default 'medium',
  assigned_to uuid references public.tenant_users(id) on delete set null,
  created_by uuid references public.tenant_users(id) on delete set null,
  vehicle_id uuid references public.tenant_vehicles(id) on delete set null,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_tasks_status_check
    check (task_status in ('open', 'in_progress', 'completed', 'cancelled')),
  constraint tenant_tasks_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent'))
);

create table if not exists public.tenant_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tenant_tasks(id) on delete cascade,
  author_id uuid references public.tenant_users(id) on delete set null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.tenant_vehicles(id) on delete cascade,
  maintenance_type text not null,
  status text not null default 'scheduled',
  service_date date,
  odometer integer,
  vendor_name text,
  cost numeric(12,2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_maintenance_status_check
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled'))
);

create table if not exists public.tenant_maintenance_parts (
  id uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.tenant_maintenance(id) on delete cascade,
  item_name text not null,
  quantity numeric(12,2) not null default 1,
  unit_cost numeric(12,2),
  total_cost numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.tenant_vehicles(id) on delete cascade,
  recorded_by uuid references public.tenant_users(id) on delete set null,
  log_type text not null default 'refill',
  quantity_liters numeric(12,2),
  amount numeric(12,2),
  odometer integer,
  station_name text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_fuel_logs_type_check
    check (log_type in ('refill', 'withdrawal', 'adjustment'))
);

create table if not exists public.tenant_inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text,
  name text not null,
  category text,
  unit text,
  current_stock numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  unit_cost numeric(12,2),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_tenant_inventory_items_sku
  on public.tenant_inventory_items (sku)
  where sku is not null;

create table if not exists public.tenant_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.tenant_inventory_items(id) on delete cascade,
  performed_by uuid references public.tenant_users(id) on delete set null,
  transaction_type text not null,
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2),
  reference_type text,
  reference_id uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_inventory_transactions_type_check
    check (transaction_type in ('in', 'out', 'adjustment'))
);

create table if not exists public.tenant_finance_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null,
  category text,
  amount numeric(12,2) not null,
  currency_code text not null default 'MAD',
  entry_date date not null default current_date,
  vehicle_id uuid references public.tenant_vehicles(id) on delete set null,
  rental_id uuid references public.tenant_rentals(id) on delete set null,
  recorded_by uuid references public.tenant_users(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_finance_entries_type_check
    check (entry_type in ('income', 'expense', 'transfer', 'adjustment'))
);

create table if not exists public.tenant_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null default 'medium',
  title text not null,
  message text,
  related_vehicle_id uuid references public.tenant_vehicles(id) on delete set null,
  related_rental_id uuid references public.tenant_rentals(id) on delete set null,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_alerts_severity_check
    check (severity in ('low', 'medium', 'high', 'critical'))
);

create table if not exists public.tenant_tours (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  base_price numeric(12,2),
  currency_code text not null default 'MAD',
  duration_minutes integer,
  capacity integer,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_tours_status_check
    check (status in ('draft', 'active', 'inactive', 'archived'))
);

create table if not exists public.tenant_tour_bookings (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tenant_tours(id) on delete cascade,
  customer_id uuid references public.tenant_customers(id) on delete set null,
  booking_status text not null default 'pending',
  participant_count integer not null default 1,
  scheduled_at timestamptz,
  total_amount numeric(12,2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_tour_bookings_status_check
    check (booking_status in ('pending', 'confirmed', 'completed', 'cancelled'))
);

drop trigger if exists trg_tenant_workspace_metadata_touch_updated_at on public.tenant_workspace_metadata;
create trigger trg_tenant_workspace_metadata_touch_updated_at
before update on public.tenant_workspace_metadata
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_users_touch_updated_at on public.tenant_users;
create trigger trg_tenant_users_touch_updated_at
before update on public.tenant_users
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_members_touch_updated_at on public.tenant_members;
create trigger trg_tenant_members_touch_updated_at
before update on public.tenant_members
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_settings_touch_updated_at on public.tenant_settings;
create trigger trg_tenant_settings_touch_updated_at
before update on public.tenant_settings
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_vehicle_models_touch_updated_at on public.tenant_vehicle_models;
create trigger trg_tenant_vehicle_models_touch_updated_at
before update on public.tenant_vehicle_models
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_vehicles_touch_updated_at on public.tenant_vehicles;
create trigger trg_tenant_vehicles_touch_updated_at
before update on public.tenant_vehicles
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_customers_touch_updated_at on public.tenant_customers;
create trigger trg_tenant_customers_touch_updated_at
before update on public.tenant_customers
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_pricing_rules_touch_updated_at on public.tenant_pricing_rules;
create trigger trg_tenant_pricing_rules_touch_updated_at
before update on public.tenant_pricing_rules
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_rentals_touch_updated_at on public.tenant_rentals;
create trigger trg_tenant_rentals_touch_updated_at
before update on public.tenant_rentals
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_tasks_touch_updated_at on public.tenant_tasks;
create trigger trg_tenant_tasks_touch_updated_at
before update on public.tenant_tasks
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_task_comments_touch_updated_at on public.tenant_task_comments;
create trigger trg_tenant_task_comments_touch_updated_at
before update on public.tenant_task_comments
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_maintenance_touch_updated_at on public.tenant_maintenance;
create trigger trg_tenant_maintenance_touch_updated_at
before update on public.tenant_maintenance
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_maintenance_parts_touch_updated_at on public.tenant_maintenance_parts;
create trigger trg_tenant_maintenance_parts_touch_updated_at
before update on public.tenant_maintenance_parts
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_fuel_logs_touch_updated_at on public.tenant_fuel_logs;
create trigger trg_tenant_fuel_logs_touch_updated_at
before update on public.tenant_fuel_logs
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_inventory_items_touch_updated_at on public.tenant_inventory_items;
create trigger trg_tenant_inventory_items_touch_updated_at
before update on public.tenant_inventory_items
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_inventory_transactions_touch_updated_at on public.tenant_inventory_transactions;
create trigger trg_tenant_inventory_transactions_touch_updated_at
before update on public.tenant_inventory_transactions
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_finance_entries_touch_updated_at on public.tenant_finance_entries;
create trigger trg_tenant_finance_entries_touch_updated_at
before update on public.tenant_finance_entries
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_alerts_touch_updated_at on public.tenant_alerts;
create trigger trg_tenant_alerts_touch_updated_at
before update on public.tenant_alerts
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_tours_touch_updated_at on public.tenant_tours;
create trigger trg_tenant_tours_touch_updated_at
before update on public.tenant_tours
for each row
execute function public.tenant_touch_updated_at();

drop trigger if exists trg_tenant_tour_bookings_touch_updated_at on public.tenant_tour_bookings;
create trigger trg_tenant_tour_bookings_touch_updated_at
before update on public.tenant_tour_bookings
for each row
execute function public.tenant_touch_updated_at();

insert into public.tenant_settings (id)
select gen_random_uuid()
where not exists (select 1 from public.tenant_settings);

