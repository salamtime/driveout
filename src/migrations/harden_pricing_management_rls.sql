begin;

do $$
begin
  if to_regclass('public.app_4c3a7a6153_base_prices') is not null then
    execute 'alter table public.app_4c3a7a6153_base_prices enable row level security';

    execute 'drop policy if exists "public read active base prices" on public.app_4c3a7a6153_base_prices';
    execute $policy$
      create policy "public read active base prices"
      on public.app_4c3a7a6153_base_prices
      for select
      to anon
      using (coalesce(is_active, true) = true)
    $policy$;

    execute 'drop policy if exists "authenticated read base prices" on public.app_4c3a7a6153_base_prices';
    execute $policy$
      create policy "authenticated read base prices"
      on public.app_4c3a7a6153_base_prices
      for select
      to authenticated
      using (true)
    $policy$;

    execute 'drop policy if exists "authenticated insert base prices" on public.app_4c3a7a6153_base_prices';
    execute $policy$
      create policy "authenticated insert base prices"
      on public.app_4c3a7a6153_base_prices
      for insert
      to authenticated
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated update base prices" on public.app_4c3a7a6153_base_prices';
    execute $policy$
      create policy "authenticated update base prices"
      on public.app_4c3a7a6153_base_prices
      for update
      to authenticated
      using (true)
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated delete base prices" on public.app_4c3a7a6153_base_prices';
    execute $policy$
      create policy "authenticated delete base prices"
      on public.app_4c3a7a6153_base_prices
      for delete
      to authenticated
      using (true)
    $policy$;

    execute 'grant select on public.app_4c3a7a6153_base_prices to anon';
    execute 'grant select, insert, update, delete on public.app_4c3a7a6153_base_prices to authenticated';
    execute 'grant select, insert, update, delete on public.app_4c3a7a6153_base_prices to service_role';
  end if;

  if to_regclass('public.pricing_tiers') is not null then
    execute 'alter table public.pricing_tiers enable row level security';

    execute 'drop policy if exists "authenticated read pricing tiers" on public.pricing_tiers';
    execute $policy$
      create policy "authenticated read pricing tiers"
      on public.pricing_tiers
      for select
      to authenticated
      using (true)
    $policy$;

    execute 'drop policy if exists "authenticated insert pricing tiers" on public.pricing_tiers';
    execute $policy$
      create policy "authenticated insert pricing tiers"
      on public.pricing_tiers
      for insert
      to authenticated
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated update pricing tiers" on public.pricing_tiers';
    execute $policy$
      create policy "authenticated update pricing tiers"
      on public.pricing_tiers
      for update
      to authenticated
      using (true)
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated delete pricing tiers" on public.pricing_tiers';
    execute $policy$
      create policy "authenticated delete pricing tiers"
      on public.pricing_tiers
      for delete
      to authenticated
      using (true)
    $policy$;

    execute 'grant select, insert, update, delete on public.pricing_tiers to authenticated';
    execute 'grant select, insert, update, delete on public.pricing_tiers to service_role';
  end if;

  if to_regclass('public.app_4c3a7a6153_transport_fees') is not null then
    execute 'alter table public.app_4c3a7a6153_transport_fees enable row level security';

    execute 'drop policy if exists "authenticated read transport fees" on public.app_4c3a7a6153_transport_fees';
    execute $policy$
      create policy "authenticated read transport fees"
      on public.app_4c3a7a6153_transport_fees
      for select
      to authenticated
      using (true)
    $policy$;

    execute 'drop policy if exists "authenticated insert transport fees" on public.app_4c3a7a6153_transport_fees';
    execute $policy$
      create policy "authenticated insert transport fees"
      on public.app_4c3a7a6153_transport_fees
      for insert
      to authenticated
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated update transport fees" on public.app_4c3a7a6153_transport_fees';
    execute $policy$
      create policy "authenticated update transport fees"
      on public.app_4c3a7a6153_transport_fees
      for update
      to authenticated
      using (true)
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated delete transport fees" on public.app_4c3a7a6153_transport_fees';
    execute $policy$
      create policy "authenticated delete transport fees"
      on public.app_4c3a7a6153_transport_fees
      for delete
      to authenticated
      using (true)
    $policy$;

    execute 'grant select, insert, update, delete on public.app_4c3a7a6153_transport_fees to authenticated';
    execute 'grant select, insert, update, delete on public.app_4c3a7a6153_transport_fees to service_role';
  end if;

  if to_regclass('public.fuel_pricing') is not null then
    execute 'alter table public.fuel_pricing enable row level security';

    execute 'drop policy if exists "authenticated read fuel pricing" on public.fuel_pricing';
    execute $policy$
      create policy "authenticated read fuel pricing"
      on public.fuel_pricing
      for select
      to authenticated
      using (true)
    $policy$;

    execute 'drop policy if exists "authenticated insert fuel pricing" on public.fuel_pricing';
    execute $policy$
      create policy "authenticated insert fuel pricing"
      on public.fuel_pricing
      for insert
      to authenticated
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated update fuel pricing" on public.fuel_pricing';
    execute $policy$
      create policy "authenticated update fuel pricing"
      on public.fuel_pricing
      for update
      to authenticated
      using (true)
      with check (true)
    $policy$;

    execute 'drop policy if exists "authenticated delete fuel pricing" on public.fuel_pricing';
    execute $policy$
      create policy "authenticated delete fuel pricing"
      on public.fuel_pricing
      for delete
      to authenticated
      using (true)
    $policy$;

    execute 'grant select, insert, update, delete on public.fuel_pricing to authenticated';
    execute 'grant select, insert, update, delete on public.fuel_pricing to service_role';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
