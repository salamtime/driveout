begin;

create extension if not exists pgcrypto;

create table if not exists public.app_4c3a7a6153_transport_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.app_organizations(id) on delete set null,
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

alter table public.app_4c3a7a6153_transport_fees enable row level security;

drop policy if exists "authenticated read transport fees" on public.app_4c3a7a6153_transport_fees;
create policy "authenticated read transport fees"
on public.app_4c3a7a6153_transport_fees
for select
to authenticated
using (true);

drop policy if exists "authenticated insert transport fees" on public.app_4c3a7a6153_transport_fees;
create policy "authenticated insert transport fees"
on public.app_4c3a7a6153_transport_fees
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update transport fees" on public.app_4c3a7a6153_transport_fees;
create policy "authenticated update transport fees"
on public.app_4c3a7a6153_transport_fees
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated delete transport fees" on public.app_4c3a7a6153_transport_fees;
create policy "authenticated delete transport fees"
on public.app_4c3a7a6153_transport_fees
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.app_4c3a7a6153_transport_fees to authenticated;
grant select, insert, update, delete on public.app_4c3a7a6153_transport_fees to service_role;

do $$
declare
  tenant_table text;
  constraint_name text;
  index_name text;
  tenant_tables text[] := array[
    'rental_extension_rules',
    'app_4c3a7a6153_transport_fees',
    'app_687f658e98_tour_packages',
    'app_687f658e98_tour_package_model_prices',
    'fuel_pricing'
  ];
begin
  foreach tenant_table in array tenant_tables loop
    if to_regclass('public.' || tenant_table) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists organization_id uuid',
      tenant_table
    );

    if to_regclass('public.app_organizations') is not null then
      constraint_name := 'fk_org_' || substr(md5(tenant_table || '_organization_id'), 1, 20);

      if not exists (
        select 1
        from pg_constraint c
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = any(c.conkey)
        where c.contype = 'f'
          and c.conrelid = to_regclass('public.' || tenant_table)
          and c.confrelid = 'public.app_organizations'::regclass
          and a.attname = 'organization_id'
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (organization_id) references public.app_organizations(id) on delete set null',
          tenant_table,
          constraint_name
        );
      end if;
    end if;

    index_name := 'idx_org_' || substr(md5(tenant_table || '_organization_id'), 1, 20);
    execute format(
      'create index if not exists %I on public.%I (organization_id)',
      index_name,
      tenant_table
    );
  end loop;

  if to_regclass('public.rental_extension_rules') is not null then
    alter table public.rental_extension_rules
      add column if not exists is_active boolean not null default true;

    alter table public.rental_extension_rules enable row level security;

    drop policy if exists "authenticated read rental extension rules" on public.rental_extension_rules;
    create policy "authenticated read rental extension rules"
    on public.rental_extension_rules
    for select
    to authenticated
    using (true);

    drop policy if exists "authenticated insert rental extension rules" on public.rental_extension_rules;
    create policy "authenticated insert rental extension rules"
    on public.rental_extension_rules
    for insert
    to authenticated
    with check (true);

    drop policy if exists "authenticated update rental extension rules" on public.rental_extension_rules;
    create policy "authenticated update rental extension rules"
    on public.rental_extension_rules
    for update
    to authenticated
    using (true)
    with check (true);

    drop policy if exists "authenticated delete rental extension rules" on public.rental_extension_rules;
    create policy "authenticated delete rental extension rules"
    on public.rental_extension_rules
    for delete
    to authenticated
    using (true);

    grant select, insert, update, delete on public.rental_extension_rules to authenticated;
    grant select, insert, update, delete on public.rental_extension_rules to service_role;
  end if;

  if to_regclass('public.app_687f658e98_tour_package_model_prices') is not null
     and to_regclass('public.app_687f658e98_tour_packages') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'app_687f658e98_tour_packages'
         and column_name = 'organization_id'
     ) then
    update public.app_687f658e98_tour_package_model_prices prices
    set organization_id = packages.organization_id
    from public.app_687f658e98_tour_packages packages
    where prices.package_id::text = packages.id::text
      and prices.organization_id is null
      and packages.organization_id is not null;
  end if;
end $$;

alter table if exists public.app_687f658e98_tour_package_model_prices
  drop constraint if exists tour_package_model_prices_unique;

create unique index if not exists idx_tour_package_model_prices_org_unique
  on public.app_687f658e98_tour_package_model_prices (
    organization_id,
    package_id,
    vehicle_model_id,
    duration_hours
  );

do $$
begin
  if to_regclass('public.fuel_pricing') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'fuel_pricing'
         and column_name = 'model_id'
     ) then
    alter table public.fuel_pricing drop constraint if exists fuel_pricing_model_id_key;
    drop index if exists public.fuel_pricing_model_id_key;
    create unique index if not exists idx_fuel_pricing_org_model_unique
      on public.fuel_pricing (organization_id, model_id);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
