begin;

alter table public.saharax_0u4w4d_vehicle_models
  add column if not exists tank_capacity_liters numeric(10, 3);

update public.saharax_0u4w4d_vehicle_models
set tank_capacity_liters = case
  when upper(coalesce(model, name, '')) like '%AT5%' then 19
  when upper(coalesce(model, name, '')) like '%AT6%' then 23
  else 23
end
where tank_capacity_liters is null;

alter table public.saharax_0u4w4d_activity_log
  enable row level security;

grant select, insert, update, delete on public.saharax_0u4w4d_activity_log to authenticated;
grant select, insert, update, delete on public.saharax_0u4w4d_activity_log to service_role;

drop policy if exists "authenticated read activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated read activity log"
on public.saharax_0u4w4d_activity_log
for select
to authenticated
using (true);

drop policy if exists "authenticated insert activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated insert activity log"
on public.saharax_0u4w4d_activity_log
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated update activity log"
on public.saharax_0u4w4d_activity_log
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated delete activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated delete activity log"
on public.saharax_0u4w4d_activity_log
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';

commit;
