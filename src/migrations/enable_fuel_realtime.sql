do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fuel_tank'
    ) then
      alter publication supabase_realtime add table public.fuel_tank;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fuel_refills'
    ) then
      alter publication supabase_realtime add table public.fuel_refills;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vehicle_fuel_refills'
    ) then
      alter publication supabase_realtime add table public.vehicle_fuel_refills;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fuel_withdrawals'
    ) then
      alter publication supabase_realtime add table public.fuel_withdrawals;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vehicle_fuel_state'
    ) then
      alter publication supabase_realtime add table public.vehicle_fuel_state;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fuel_operation_logs'
    ) then
      alter publication supabase_realtime add table public.fuel_operation_logs;
    end if;
  end if;
end $$;
