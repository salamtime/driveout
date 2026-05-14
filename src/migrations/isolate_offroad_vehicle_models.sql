begin;

create extension if not exists pgcrypto;

do $$
declare
  current_table text;
  constraint_name text;
  source_model record;
  target_model_id text;
  model_id_cast text;
  platform_org_id uuid;
  offroad_org_id uuid;
  copied_models integer := 0;
  copied_base_prices integer := 0;
  copied_packages integer := 0;
  copied_tiers integer := 0;
  affected_rows integer := 0;
begin
  select id
    into platform_org_id
  from public.app_organizations
  where coalesce(is_platform_organization, false) = true
  order by created_at asc
  limit 1;

  select id
    into offroad_org_id
  from public.app_organizations
  where lower(coalesce(slug, '')) = 'offroad'
     or lower(coalesce(name, '')) like '%offroad%'
  order by created_at desc
  limit 1;

  if offroad_org_id is null then
    raise exception 'OFFROAD organization was not found. Aborting without changing vehicle model data.';
  end if;

  foreach current_table in array array[
    'saharax_0u4w4d_vehicle_models',
    'app_4c3a7a6153_base_prices',
    'app_4c3a7a6153_rental_km_packages',
    'pricing_tiers'
  ] loop
    if to_regclass('public.' || current_table) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists organization_id uuid',
      current_table
    );

    constraint_name := 'fk_org_' || substr(md5(current_table || '_organization_id'), 1, 20);

    if not exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any(c.conkey)
      where c.contype = 'f'
        and c.conrelid = to_regclass('public.' || current_table)
        and c.confrelid = 'public.app_organizations'::regclass
        and a.attname = 'organization_id'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id) references public.app_organizations(id) on delete set null',
        current_table,
        constraint_name
      );
    end if;

    execute format(
      'create index if not exists %I on public.%I (organization_id)',
      'idx_' || current_table || '_organization_id',
      current_table
    );
  end loop;

  if to_regclass('public.saharax_0u4w4d_vehicle_models') is null then
    raise exception 'Vehicle models table was not found.';
  end if;

  select case
      when data_type = 'uuid' then '$2::uuid'
      when data_type in ('bigint', 'integer') then '$2::bigint'
      else '$2'
    end
    into model_id_cast
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'saharax_0u4w4d_vehicle_models'
    and column_name = 'id';

  model_id_cast := coalesce(model_id_cast, '$2::uuid');

  alter table public.saharax_0u4w4d_vehicle_models
    drop constraint if exists saharax_0u4w4d_vehicle_models_name_model_vehicle_type_key;

  drop index if exists public.idx_vehicle_models_name_unique;

  create unique index if not exists idx_vehicle_models_org_model_key
    on public.saharax_0u4w4d_vehicle_models (
      coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
      lower(trim(coalesce(name, ''))),
      lower(trim(coalesce(model, ''))),
      lower(trim(coalesce(vehicle_type, '')))
    )
    where coalesce(is_active, true) = true;

  for source_model in
    select *
    from public.saharax_0u4w4d_vehicle_models
    where organization_id is null
    order by created_at asc nulls last, name asc
  loop
    select id::text
      into target_model_id
    from public.saharax_0u4w4d_vehicle_models
    where organization_id = offroad_org_id
      and lower(trim(coalesce(name, ''))) = lower(trim(coalesce(source_model.name, '')))
      and lower(trim(coalesce(model, ''))) = lower(trim(coalesce(source_model.model, '')))
      and lower(trim(coalesce(vehicle_type, ''))) = lower(trim(coalesce(source_model.vehicle_type, '')))
    order by created_at asc nulls last
    limit 1;

    if target_model_id is null then
      insert into public.saharax_0u4w4d_vehicle_models (
        organization_id,
        name,
        model,
        vehicle_type,
        description,
        image_url,
        power_cc_min,
        power_cc_max,
        capacity_min,
        capacity_max,
        features,
        tank_capacity_liters,
        hourly_price,
        daily_price,
        is_active,
        created_at,
        updated_at
      )
      values (
        offroad_org_id,
        source_model.name,
        source_model.model,
        source_model.vehicle_type,
        source_model.description,
        source_model.image_url,
        source_model.power_cc_min,
        source_model.power_cc_max,
        source_model.capacity_min,
        source_model.capacity_max,
        source_model.features,
        source_model.tank_capacity_liters,
        source_model.hourly_price,
        source_model.daily_price,
        source_model.is_active,
        now(),
        now()
      )
      returning id::text into target_model_id;

      copied_models := copied_models + 1;
    end if;

    if to_regclass('public.app_4c3a7a6153_base_prices') is not null then
      execute format($sql$
        insert into public.app_4c3a7a6153_base_prices (
          organization_id,
          vehicle_model_id,
          hourly_price,
          daily_price,
          weekly_price,
          monthly_price,
          dynamic_pricing_enabled,
          is_active,
          price_source,
          requires_manual_extension,
          last_modified_by,
          modification_reason,
          created_at,
          updated_at
        )
        select
          $1,
          %s,
          bp.hourly_price,
          bp.daily_price,
          bp.weekly_price,
          bp.monthly_price,
          bp.dynamic_pricing_enabled,
          bp.is_active,
          bp.price_source,
          bp.requires_manual_extension,
          bp.last_modified_by,
          bp.modification_reason,
          now(),
          now()
        from public.app_4c3a7a6153_base_prices bp
        where bp.vehicle_model_id::text = $3
          and (bp.organization_id is null or bp.organization_id = $4)
          and not exists (
            select 1
            from public.app_4c3a7a6153_base_prices existing
            where existing.organization_id = $1
              and existing.vehicle_model_id::text = $2
              and coalesce(existing.hourly_price, 0) = coalesce(bp.hourly_price, 0)
              and coalesce(existing.daily_price, 0) = coalesce(bp.daily_price, 0)
              and coalesce(existing.weekly_price, 0) = coalesce(bp.weekly_price, 0)
              and coalesce(existing.monthly_price, 0) = coalesce(bp.monthly_price, 0)
          )
      $sql$, model_id_cast)
      using offroad_org_id, target_model_id, source_model.id::text, platform_org_id;

      get diagnostics affected_rows = row_count;
      copied_base_prices := copied_base_prices + affected_rows;
    end if;

    if to_regclass('public.app_4c3a7a6153_rental_km_packages') is not null then
      execute format($sql$
        insert into public.app_4c3a7a6153_rental_km_packages (
          organization_id,
          vehicle_model_id,
          name,
          description,
          rate_type_id,
          included_kilometers,
          extra_km_rate,
          fixed_amount,
          duration_units,
          fuel_charge_enabled,
          show_on_print,
          is_active,
          created_at,
          updated_at
        )
        select
          $1,
          %s,
          pkg.name,
          pkg.description,
          pkg.rate_type_id,
          pkg.included_kilometers,
          pkg.extra_km_rate,
          pkg.fixed_amount,
          pkg.duration_units,
          pkg.fuel_charge_enabled,
          pkg.show_on_print,
          pkg.is_active,
          now(),
          now()
        from public.app_4c3a7a6153_rental_km_packages pkg
        where pkg.vehicle_model_id::text = $3
          and (pkg.organization_id is null or pkg.organization_id = $4)
          and not exists (
            select 1
            from public.app_4c3a7a6153_rental_km_packages existing
            where existing.organization_id = $1
              and existing.vehicle_model_id::text = $2
              and lower(trim(coalesce(existing.name, ''))) = lower(trim(coalesce(pkg.name, '')))
              and coalesce(existing.rate_type_id, 0) = coalesce(pkg.rate_type_id, 0)
              and coalesce(existing.fixed_amount, 0) = coalesce(pkg.fixed_amount, 0)
              and coalesce(existing.included_kilometers, -1) = coalesce(pkg.included_kilometers, -1)
          )
      $sql$, model_id_cast)
      using offroad_org_id, target_model_id, source_model.id::text, platform_org_id;

      get diagnostics affected_rows = row_count;
      copied_packages := copied_packages + affected_rows;
    end if;

    if to_regclass('public.pricing_tiers') is not null then
      execute format($sql$
        insert into public.pricing_tiers (
          organization_id,
          vehicle_model_id,
          min_hours,
          max_hours,
          price_amount,
          calculation_method,
          discount_percentage,
          is_active,
          duration_type,
          min_days,
          max_days,
          daily_price_amount,
          daily_calculation_method,
          daily_discount_percentage,
          created_at,
          updated_at
        )
        select
          $1,
          %s,
          tier.min_hours,
          tier.max_hours,
          tier.price_amount,
          tier.calculation_method,
          tier.discount_percentage,
          tier.is_active,
          tier.duration_type,
          tier.min_days,
          tier.max_days,
          tier.daily_price_amount,
          tier.daily_calculation_method,
          tier.daily_discount_percentage,
          now(),
          now()
        from public.pricing_tiers tier
        where tier.vehicle_model_id::text = $3
          and (tier.organization_id is null or tier.organization_id = $4)
          and not exists (
            select 1
            from public.pricing_tiers existing
            where existing.organization_id = $1
              and existing.vehicle_model_id::text = $2
              and coalesce(existing.duration_type, '') = coalesce(tier.duration_type, '')
              and coalesce(existing.min_hours, -1) = coalesce(tier.min_hours, -1)
              and coalesce(existing.max_hours, -1) = coalesce(tier.max_hours, -1)
              and coalesce(existing.min_days, -1) = coalesce(tier.min_days, -1)
              and coalesce(existing.max_days, -1) = coalesce(tier.max_days, -1)
              and coalesce(existing.price_amount, 0) = coalesce(tier.price_amount, 0)
              and coalesce(existing.daily_price_amount, 0) = coalesce(tier.daily_price_amount, 0)
          )
      $sql$, model_id_cast)
      using offroad_org_id, target_model_id, source_model.id::text, platform_org_id;

      get diagnostics affected_rows = row_count;
      copied_tiers := copied_tiers + affected_rows;
    end if;

    target_model_id := null;
  end loop;

  raise notice 'Offroad isolation copied % models, % base prices, % packages, % pricing tiers.',
    copied_models,
    copied_base_prices,
    copied_packages,
    copied_tiers;
end $$;

do $$
declare
  current_table text;
  policy_record record;
begin
  foreach current_table in array array[
    'saharax_0u4w4d_vehicle_models',
    'app_4c3a7a6153_base_prices',
    'app_4c3a7a6153_rental_km_packages',
    'pricing_tiers'
  ] loop
    if to_regclass('public.' || current_table) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', current_table);
    execute format('alter table public.%I force row level security', current_table);

    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = current_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, current_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.app_has_current_organization_access(organization_id))',
      'tenant select ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.app_has_current_organization_access(organization_id))',
      'tenant insert ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.app_has_current_organization_access(organization_id)) with check (public.app_has_current_organization_access(organization_id))',
      'tenant update ' || current_table,
      current_table
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.app_has_current_organization_access(organization_id))',
      'tenant delete ' || current_table,
      current_table
    );

    execute format(
      'grant select on public.%I to authenticated, service_role',
      current_table
    );
    execute format(
      'grant insert, update, delete on public.%I to authenticated, service_role',
      current_table
    );
  end loop;

  if to_regclass('public.saharax_0u4w4d_vehicle_models') is not null then
    execute 'grant select on public.saharax_0u4w4d_vehicle_models to anon';
    execute 'create policy "public read legacy active vehicle models" on public.saharax_0u4w4d_vehicle_models for select to anon using (organization_id is null and coalesce(is_active, true) = true)';
  end if;

  if to_regclass('public.app_4c3a7a6153_base_prices') is not null then
    execute 'grant select on public.app_4c3a7a6153_base_prices to anon';
    execute 'create policy "public read legacy active base prices" on public.app_4c3a7a6153_base_prices for select to anon using (organization_id is null and coalesce(is_active, true) = true)';
  end if;

  if to_regclass('public.app_4c3a7a6153_rental_km_packages') is not null then
    execute 'grant select on public.app_4c3a7a6153_rental_km_packages to anon';
    execute 'create policy "public read legacy active rental km packages" on public.app_4c3a7a6153_rental_km_packages for select to anon using (organization_id is null and coalesce(is_active, true) = true)';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
